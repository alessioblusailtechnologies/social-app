import type { Brand } from '@/domain/brand';
import { cutKey, type Content } from '@/domain/content';
import { brandKit, coverPage } from '@/domain/visual';
import { stepsInSequence } from '@/services/ai-steps';
import type { OnAiSteps } from '@/services/types';

import { coverVideo } from '../ai/video-cover';
import { cutVideo } from '../ai/video-cut';
import { ApiError } from '../contract/errors';
import { requireBrand } from '../data/brands';
import { requireContent, saveContent } from '../data/contents';
import type { Identity } from '../db/identity';
import { mediaPath } from '../visual/files';
import { aiMeta, inTransaction, type Deps } from './deps';
import { withBrandMusic } from './music';

/**
 * «Monta il video»: l'agente monta la regia com'è adesso, con i cartelli dove manca il materiale. Come il disegno
 * della card non passa dalla transazione: ci mette minuti, e bloccherebbe la riga del contenuto a chiunque altro.
 */
export async function cutContentVideo(deps: Deps, identity: Identity, contentId: string, onSteps?: OnAiSteps): Promise<Content> {
  const { content, brand: stored } = await inTransaction(deps, identity, async (db) => {
    const content = await requireContent(db, contentId);
    return { content, brand: await requireBrand(db, content.brandId) };
  });
  assertCuttable(content);

  // La musica: quella scelta dall'utente, nessuna, o la sceglie chi monta tra quelle del brand. In quest'ultimo caso
  // la libreria nasce al primo montaggio, e chi aspetta vede i suoi passi sopra quelli del montaggio.
  const choice = content.visual.musicId;
  const steps = stepsInSequence(onSteps);
  let brand = stored;
  if (choice === undefined) {
    try {
      brand = await withBrandMusic(deps, identity, stored, steps.first);
    } catch {
      // Senza musica il video si monta lo stesso: la si rifà dal Profilo.
    }
  }
  const library = brand.visual.music ?? [];
  const picked = typeof choice === 'string' ? library.filter((track) => track.id === choice) : [];
  // Dopo il montaggio, la copertina: i passi dell'una seguono quelli dell'altro, in un lavoro solo.
  const cutting = stepsInSequence(steps.then);
  const cut = await cutVideo(deps.ai, aiMeta(identity, content.brandId), {
    content,
    music: choice === null ? [] : picked.length > 0 ? picked : library,
    chosen: picked.length > 0 ? 'track' : choice === null ? 'none' : 'auto',
    onSteps: cutting.first,
  });

  const saved = await inTransaction(deps, identity, async (db) => {
    const fresh = await requireContent(db, contentId);
    assertCuttable(fresh);
    return saveContent(db, {
      ...fresh,
      visual: {
        ...fresh.visual,
        // L'impronta è della regia montata, non di quella di adesso: se nel frattempo è cambiata, si vede subito.
        cut: {
          file: { path: cut.path, url: '' },
          placeholders: cut.placeholders,
          seconds: cut.seconds,
          trackId: cut.trackId,
          from: cutKey(content.visual),
          madeAt: deps.now().toISOString(),
        },
      },
    });
  });

  // La copertina non deve costare il montaggio: se non riesce, il video resta e la si rifà dal pannello.
  try {
    return await coverContent(deps, identity, saved, brand, cutting.then);
  } catch (error) {
    if (error instanceof ApiError && error.status < 500) throw error;
    return saved;
  }
}

/**
 * La copertina del reel, dal montaggio che c'è: l'agente sceglie il fotogramma, lo rifinisce, la compone col motore
 * del brand. Se ha rimesso la copertina in testa al video (per TikTok), il montaggio prende quel file.
 */
async function coverContent(deps: Deps, identity: Identity, content: Content, brand: Brand, onSteps?: OnAiSteps): Promise<Content> {
  const cutPath = content.visual.cut?.file.path;
  if (!cutPath) throw ApiError.invalid('Monta prima il video: la copertina nasce dal montaggio.');
  const cover = await coverVideo(deps.ai, aiMeta(identity, content.brandId), { brand, content, cutPath, onSteps });

  return inTransaction(deps, identity, async (db) => {
    const fresh = await requireContent(db, content.id);
    const cut = fresh.visual.cut;
    // Rimontato nel frattempo: questa copertina è del montaggio di prima.
    if (!cut || cut.file.path !== cutPath) return fresh;
    return saveContent(db, {
      ...fresh,
      visual: {
        ...fresh.visual,
        cut: cover.video ? { ...cut, file: { path: cover.video, url: '' } } : cut,
        cover: {
          file: { path: cover.file, url: '' },
          photo: cover.photo ? { path: cover.photo, url: '' } : null,
          cutout: cover.cutout ? { path: cover.cutout, url: '' } : null,
          template: cover.template,
          title: cover.title,
          kicker: cover.kicker,
          madeAt: deps.now().toISOString(),
        },
      },
    });
  });
}

/** «Rifai la copertina»: dal montaggio di adesso, coi passi. */
export async function makeContentCover(deps: Deps, identity: Identity, contentId: string, onSteps?: OnAiSteps): Promise<Content> {
  const { content, brand } = await inTransaction(deps, identity, async (db) => {
    const content = await requireContent(db, contentId);
    return { content, brand: await requireBrand(db, content.brandId) };
  });
  if (content.format !== 'video') throw ApiError.invalid('La copertina è dei video.');
  return coverContent(deps, identity, content, brand, onSteps);
}

/**
 * Il titolo della copertina cambiato a mano: si ricompone col motore, sulla stessa immagine e lo stesso template.
 * Nessuna AI. Il primo fotogramma del video (quello per TikTok) resta il vecchio finché non si rifà la copertina.
 */
export async function retitleCover(deps: Deps, identity: Identity, contentId: string, title: string, kicker: string): Promise<Content> {
  const { content, brand } = await inTransaction(deps, identity, async (db) => {
    const content = await requireContent(db, contentId);
    return { content, brand: await requireBrand(db, content.brandId) };
  });
  const cover = content.visual.cover;
  if (!cover) throw ApiError.invalid('Il video non ha ancora una copertina.');
  const page = coverPage(brand.visual.line, cover.template, title, kicker);
  if (!page) throw ApiError.invalid('Il template della copertina non c’è più: rifai la copertina.');
  const paths = [cover.photo?.path, cover.cutout?.path].filter((path): path is string => Boolean(path));
  const urls = await deps.media.storage.sign(paths);
  const kit = brandKit(brand);
  const logoUrl = kit.logoUrl && /^(https:|data:image\/)/.test(kit.logoUrl) ? kit.logoUrl : null;
  let png: Uint8Array;
  try {
    png = await deps.media.renderer.render({
      kit: { ...kit, logoUrl, signature: kit.signature && logoUrl !== null },
      page,
      pageIndex: 0,
      pageCount: 1,
      photoUrl: cover.photo?.path ? (urls.get(cover.photo.path) ?? null) : null,
      cutoutUrl: cover.cutout?.path ? (urls.get(cover.cutout.path) ?? null) : null,
      aspect: '9:16',
    });
  } catch {
    throw new ApiError(502, 'RENDER_FAILED', 'Non sono riuscito a ricomporre la copertina. Riprova.');
  }
  const path = mediaPath(identity.accountId, content.brandId, 'image/png');
  await deps.media.storage.upload(path, png, 'image/png');

  return inTransaction(deps, identity, async (db) => {
    const fresh = await requireContent(db, contentId);
    if (!fresh.visual.cover) return fresh;
    return saveContent(db, {
      ...fresh,
      visual: { ...fresh.visual, cover: { ...fresh.visual.cover, file: { path, url: '' }, title, kicker, madeAt: deps.now().toISOString() } },
    });
  });
}

function assertCuttable(content: Content): void {
  if (content.format !== 'video') throw ApiError.invalid('Si monta solo un contenuto in formato video.');
  if (content.visual.scenes.length === 0) throw ApiError.invalid('Il video non ha ancora una regia: prepara la bozza.');
  // Si rimonta anche a contenuto approvato: arrivano i girati, e il video si completa.
}

/**
 * La musica del video: una traccia del brand, «senza musica», o `auto` perché la scelga chi monta. Nessuna AI: il
 * montaggio risulta da rifare, e la si sente rimontando. Si sceglie anche a contenuto approvato, come il girato.
 */
export async function setContentMusic(deps: Deps, identity: Identity, contentId: string, choice: string | null): Promise<Content> {
  return inTransaction(deps, identity, async (db) => {
    const content = await requireContent(db, contentId);
    if (content.format !== 'video') throw ApiError.invalid('La musica si sceglie solo per un video.');
    if (choice !== null && choice !== 'auto') {
      const brand = await requireBrand(db, content.brandId);
      if (!(brand.visual.music ?? []).some((track) => track.id === choice)) throw ApiError.invalid('Questa traccia non è del brand.');
    }
    const { musicId: _previous, ...visual } = content.visual;
    return saveContent(db, { ...content, visual: choice === 'auto' ? visual : { ...visual, musicId: choice } });
  });
}
