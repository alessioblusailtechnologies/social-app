import type { FastifyBaseLogger } from 'fastify';
import type pg from 'pg';

import type { Brand } from '@/domain/brand';
import type { Content } from '@/domain/content';
import {
  aspectsFor,
  brandKit,
  creationSteps,
  imageRoles,
  photoAspectFor,
  type MediaFile,
  type VisualDesign,
  type VisualRender,
} from '@/domain/visual';

import { photoPrompt } from '../ai/image-prompt';
import { ApiError } from '../contract/errors';
import { requireBrand } from '../data/brands';
import { findContent, recentBrandPhotoPaths, saveContent } from '../data/contents';
import { claimVisualJob, enqueueVisualJob, finishVisualJob, recoverVisualJobs, type VisualJob } from '../data/visual-jobs';
import { withIdentity, type Identity } from '../db/identity';
import type { MediaDeps } from '../media';
import type { MediaBytes } from '../media/images';
import { mediaPath } from './files';

/**
 * La coda dei visivi, nel processo dell'API. Un lavoro `create` fa i passi che mancano (foto, scontorno) e dopo
 * ognuno salva il contenuto: l'app, che lo rilegge, vede a che punto è. Poi la card è pronta e mette in coda un
 * lavoro `render`, che fa i PNG da scaricare: se be-render non risponde il visivo resta pronto, senza PNG. Le letture e le scritture del contenuto passano dall'identità
 * dell'account del lavoro, quindi dalla RLS; la coda la tocca il ruolo proprietario.
 */

export interface VisualJobs {
  /** Dopo aver messo in coda: il lavoro parte subito invece che al prossimo giro. */
  wake(): void;
}

export interface VisualRunner extends VisualJobs {
  /** Rimette in coda i lavori rimasti a metà e comincia a eseguire. Lo chiama `server.ts`. */
  start(): Promise<void>;
  stop(): void;
  /** Esegue in fila tutti i lavori in coda e dice quanti: nei test, al posto di `start`. */
  runPending(): Promise<number>;
}

export interface VisualRunnerOptions {
  pool: pg.Pool;
  media: MediaDeps;
  log: FastifyBaseLogger;
  /** Lavori insieme: ognuno tiene aperte chiamate lunghe a Gemini o a be-render. */
  concurrency?: number;
  pollMs?: number;
}

const STALE_MINUTES = 10;
const MAX_ATTEMPTS = 3;
const REFERENCE_PHOTOS = 3;
const GENERIC_FAILURE = 'La creazione del visivo non è riuscita. Riprova.';

interface Loaded {
  content: Content;
  brand: Brand;
  design: VisualDesign;
}

/** Quello da cui dipendono i PNG: se cambia mentre si compone, i PNG appena fatti non valgono. */
function renderKey(content: Content, design: VisualDesign): string {
  return JSON.stringify([
    content.format,
    content.channels,
    design.kind,
    design.pages,
    design.image.photo?.path ?? null,
    design.image.cutout?.path ?? null,
  ]);
}

export function createVisualRunner({ pool, media, log, concurrency = 2, pollMs = 5000 }: VisualRunnerOptions): VisualRunner {
  let started = false;
  let pumping = false;
  let active = 0;
  let timer: NodeJS.Timeout | undefined;

  const load = (identity: Identity, contentId: string) =>
    withIdentity(pool, identity, async (db): Promise<Loaded | null> => {
      const content = await findContent(db, contentId);
      const design = content?.visual.design;
      if (!content || !design) return null;
      return { content, design, brand: await requireBrand(db, content.brandId) };
    });

  /** Rilegge e cambia il design nella stessa transazione; `change` dà null quando non c'è più niente da fare. */
  const update = (
    identity: Identity,
    contentId: string,
    change: (design: VisualDesign, content: Content) => VisualDesign | null,
  ) =>
    withIdentity(pool, identity, async (db) => {
      const content = await findContent(db, contentId);
      const design = content?.visual.design;
      if (!content || !design) return false;
      const next = change(design, content);
      if (!next) return false;
      await saveContent(db, { ...content, visual: { ...content.visual, design: next } });
      return true;
    });

  const whileCreating = (change: (design: VisualDesign) => VisualDesign) => (design: VisualDesign) =>
    design.status === 'creating' ? change(design) : null;

  async function store(identity: Identity, brandId: string, file: MediaBytes): Promise<MediaFile> {
    const path = mediaPath(identity.accountId, brandId, file.mimeType);
    await media.storage.upload(path, file.bytes, file.mimeType);
    return { path, url: '' };
  }

  /** Le ultime foto generate dal brand, come riferimento di stile. Una che non si scarica si salta. */
  async function references(identity: Identity, { brand, content }: Loaded): Promise<MediaBytes[]> {
    const paths = await withIdentity(pool, identity, (db) => recentBrandPhotoPaths(db, brand.id, content.id, REFERENCE_PHOTOS));
    const files = await Promise.all(
      paths.map((path) =>
        media.storage.download(path).then(
          (file) => ({ bytes: file.bytes, mimeType: file.contentType }),
          () => null,
        ),
      ),
    );
    return files.filter((file): file is MediaBytes => file !== null && file.mimeType.startsWith('image/'));
  }

  async function generatePhoto(identity: Identity, loaded: Loaded): Promise<MediaFile> {
    const { content, brand, design } = loaded;
    if (!design.image.description.trim()) throw ApiError.invalid('Scrivi cosa si vede nella foto, o usa una tua foto.');
    const aspectRatio = photoAspectFor(aspectsFor(content.channels, content.format));
    const refs = await references(identity, loaded);
    const prompt = photoPrompt({
      description: design.image.description,
      // Una foto che serve solo allo scontorno si chiede già col soggetto isolato.
      role: imageRoles(design).includes('photo') ? 'photo' : 'cutout',
      aspectRatio,
      brand,
      references: refs.length,
    });
    const image = await media.images.generate({
      prompt,
      aspectRatio,
      references: refs,
      meta: { accountId: identity.accountId, brandId: brand.id },
    });
    return store(identity, brand.id, image);
  }

  async function cutPhoto(identity: Identity, { brand, design }: Loaded): Promise<MediaFile> {
    const path = design.image.photo?.path;
    if (!path) throw new Error('manca la foto da scontornare');
    const imageUrl = (await media.storage.sign([path])).get(path);
    if (!imageUrl) throw new Error('la foto da scontornare non si firma');
    const cutout = await media.cutout.cut({ imageUrl, meta: { accountId: identity.accountId, brandId: brand.id } });
    return store(identity, brand.id, cutout);
  }

  /** Un PNG per ogni pagina in ogni formato dei canali. */
  async function renderAll(identity: Identity, { content, brand, design }: Loaded): Promise<VisualRender[]> {
    const photoPath = design.image.photo?.path ?? null;
    const cutoutPath = design.image.cutout?.path ?? null;
    const urls = await media.storage.sign([photoPath, cutoutPath].filter((path): path is string => Boolean(path)));
    const signed = (path: string | null) => {
      if (!path) return null;
      const url = urls.get(path);
      if (!url) throw new Error(`${path} non si firma`);
      return url;
    };
    const photoUrl = signed(photoPath);
    const cutoutUrl = signed(cutoutPath);

    const kit = brandKit(brand);
    // Il logo passa solo se be-render lo può aprire: un percorso del telefono non si vede dal server.
    const logoUrl = kit.logoUrl && /^(https:|data:image\/)/.test(kit.logoUrl) ? kit.logoUrl : null;
    const renderKit = { ...kit, logoUrl, signature: kit.signature && logoUrl !== null };

    const renders: VisualRender[] = [];
    for (const [index, page] of design.pages.entries()) {
      for (const aspect of aspectsFor(content.channels, content.format)) {
        const png = await media.renderer.render({
          kit: renderKit,
          page,
          pageIndex: index,
          pageCount: design.pages.length,
          photoUrl,
          cutoutUrl,
          aspect,
        });
        renders.push({ page: index, aspect, file: await store(identity, brand.id, { bytes: png, mimeType: 'image/png' }) });
      }
    }
    return renders;
  }

  async function runCreate(job: VisualJob, identity: Identity): Promise<void> {
    // Un passo per giro; il tetto ferma un giro infinito se un passo non avanza.
    for (let turn = 0; turn < 5; turn++) {
      const loaded = await load(identity, job.contentId);
      if (!loaded || loaded.design.status !== 'creating') return;
      const step = creationSteps(loaded.design)[0];
      if (loaded.design.step !== step) await update(identity, job.contentId, whileCreating((design) => ({ ...design, step })));

      if (step === 'image') {
        const photo = await generatePhoto(identity, loaded);
        await update(identity, job.contentId, whileCreating((design) => ({ ...design, image: { ...design.image, photo } })));
      } else if (step === 'cutout') {
        const cutout = await cutPhoto(identity, loaded);
        await update(identity, job.contentId, whileCreating((design) => ({ ...design, image: { ...design.image, cutout } })));
      } else {
        // Con foto e scontorno la card è pronta: l'app la disegna dal vivo con gli stessi template. I PNG da scaricare
        // li fa un lavoro a parte, così un servizio di render spento o lento non blocca il visivo.
        const ready = await update(
          identity,
          job.contentId,
          whileCreating((design) => ({ ...design, renders: [], status: 'ready', step: null, error: null })),
        );
        if (ready) {
          await withIdentity(pool, identity, (db) =>
            enqueueVisualJob(db, { contentId: job.contentId, accountId: identity.accountId, brandId: job.brandId, kind: 'render' }),
          );
        }
        return;
      }
    }
    throw new Error('la creazione non avanza');
  }

  async function runRender(job: VisualJob, identity: Identity): Promise<void> {
    for (let turn = 0; turn < 3; turn++) {
      const loaded = await load(identity, job.contentId);
      if (!loaded || loaded.design.status !== 'ready') return;
      const key = renderKey(loaded.content, loaded.design);
      const renders = await renderAll(identity, loaded);
      const saved = await update(identity, job.contentId, (design, content) =>
        design.status === 'ready' && renderKey(content, design) === key ? { ...design, renders } : null,
      );
      if (saved) return;
    }
  }

  async function runJob(job: VisualJob): Promise<void> {
    const identity: Identity = { accountId: job.accountId };
    try {
      if (job.attempts > MAX_ATTEMPTS) throw new Error(`fermato dopo ${MAX_ATTEMPTS} tentativi`);
      if (job.kind === 'create') await runCreate(job, identity);
      else await runRender(job, identity);
      await finishVisualJob(pool, job.id, null);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      log.error({ err: error, jobId: job.id, contentId: job.contentId, kind: job.kind }, 'lavoro del visivo non riuscito');
      if (job.kind === 'create') {
        const message = error instanceof ApiError ? error.message : GENERIC_FAILURE;
        await update(
          identity,
          job.contentId,
          whileCreating((design) => ({ ...design, status: 'failed', step: null, error: message })),
        ).catch((failure: unknown) => log.error({ err: failure }, 'stato del visivo non aggiornato'));
      }
      await finishVisualJob(pool, job.id, detail.slice(0, 1000)).catch((failure: unknown) =>
        log.error({ err: failure }, 'lavoro del visivo non chiuso'),
      );
    }
  }

  async function pump(): Promise<void> {
    if (!started || pumping) return;
    pumping = true;
    try {
      while (started && active < concurrency) {
        const job = await claimVisualJob(pool);
        if (!job) break;
        active += 1;
        void runJob(job).finally(() => {
          active -= 1;
          void pump();
        });
      }
    } catch (error) {
      log.error({ err: error }, 'coda dei visivi non letta');
    } finally {
      pumping = false;
    }
  }

  return {
    wake() {
      void pump();
    },

    async start() {
      if (started) return;
      started = true;
      try {
        const recovered = await recoverVisualJobs(pool, STALE_MINUTES);
        if (recovered > 0) log.warn({ recovered }, 'lavori dei visivi rimessi in coda dopo un riavvio');
      } catch (error) {
        log.error({ err: error }, 'coda dei visivi non ripristinata');
      }
      timer = setInterval(() => void pump(), pollMs);
      timer.unref();
      void pump();
    },

    stop() {
      started = false;
      if (timer) clearInterval(timer);
    },

    async runPending() {
      let count = 0;
      for (let job = await claimVisualJob(pool); job; job = await claimVisualJob(pool)) {
        await runJob(job);
        count += 1;
      }
      return count;
    },
  };
}
