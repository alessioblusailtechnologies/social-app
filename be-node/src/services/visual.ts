import type { ChannelId } from '@/domain/brand';
import type { Content } from '@/domain/content';
import type { OnAiSteps } from '@/services/types';
import {
  VisualBusyError,
  creationSteps,
  editDesign,
  fallbackDesign,
  refreshDesign,
  withUploadedPhoto,
  withoutPhoto,
  type VisualDesign,
  type VisualEdit,
} from '@/domain/visual';

import { designFromOutput, designVisual } from '../ai/visual-design';
import { ApiError } from '../contract/errors';
import { requireBrand } from '../data/brands';
import { requireContent, saveContent } from '../data/contents';
import { enqueueVisualJob, type VisualJobKind } from '../data/visual-jobs';
import type { Identity } from '../db/identity';
import type { Queryable } from '../db/pool';
import { mediaPath } from '../visual/files';
import { inTransaction, type Deps } from './deps';

/**
 * Il visivo di un contenuto. Le modifiche senza AI si salvano subito; creare (foto, scontorno, PNG) mette un
 * lavoro in coda nella stessa transazione, e l'app segue i passi rileggendo il contenuto. Le regole sono quelle
 * del dominio (`src/domain/visual.ts`), le stesse del mock.
 */

export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

const SIGNATURES: Record<string, (bytes: Uint8Array) => boolean> = {
  'image/png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/webp': (b) => String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP',
};

/** Una foto dell'utente come data URI: solo PNG, JPEG o WebP veri, fino a 3 MB. */
export function parsePhotoDataUri(dataUri: string): { bytes: Uint8Array; mimeType: string } {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUri.trim());
  if (!match) throw ApiError.invalid('La foto deve essere un PNG, un JPEG o un WebP.');
  const [, mimeType, base64] = match;
  const bytes = new Uint8Array(Buffer.from(base64, 'base64'));
  if (bytes.byteLength > MAX_PHOTO_BYTES) throw new ApiError(413, 'TOO_LARGE', 'La foto è troppo pesante: al massimo 3 MB.');
  if (bytes.byteLength < 12 || !SIGNATURES[mimeType](bytes)) throw ApiError.invalid('Il file non è una foto valida.');
  return { bytes, mimeType };
}

function requireDesign(content: Content): VisualDesign {
  if (content.format === 'video') throw ApiError.invalid('Un video non ha una card.');
  if (!content.visual.design) throw ApiError.invalid('Il contenuto non ha ancora una proposta di visivo.');
  return content.visual.design;
}

function assertEditable(content: Content): void {
  if (content.status === 'approved') {
    throw ApiError.conflict('CONTENT_APPROVED', 'Il contenuto è approvato: riaprilo per cambiare il visivo.');
  }
}

/** Il dominio dice «in creazione» con un'eccezione sua: al client arriva un 409. */
function applyRule<T>(rule: () => T): T {
  try {
    return rule();
  } catch (error) {
    if (error instanceof VisualBusyError) throw ApiError.conflict('VISUAL_BUSY', error.message);
    throw error;
  }
}

const withDesign = (content: Content, design: VisualDesign): Content => ({ ...content, visual: { ...content.visual, design } });

function enqueue(db: Queryable, identity: Identity, content: Content, kind: VisualJobKind): Promise<void> {
  return enqueueVisualJob(db, { contentId: content.id, accountId: identity.accountId, brandId: content.brandId, kind });
}

/** Quello che manca si dice subito, invece di scoprirlo in coda. */
function assertCanCreate(deps: Deps, design: VisualDesign): void {
  const steps = creationSteps(design);
  if (steps.includes('image') && !design.image.description.trim()) {
    throw ApiError.invalid('Scrivi cosa si vede nella foto, o usa una tua foto.');
  }
  if (steps.includes('image') && !deps.media.images.available) {
    throw ApiError.unavailable('IMAGES_UNAVAILABLE', 'La generazione delle foto non è configurata su questo server: usa una tua foto.');
  }
  if (steps.includes('cutout') && !deps.media.cutout.available) {
    throw ApiError.unavailable(
      'CUTOUT_UNAVAILABLE',
      'Lo scontorno non è configurato su questo server: scegli un layout senza soggetto scontornato.',
    );
  }
}

/**
 * Una modifica senza AI. Se la card resta pronta ma i PNG non valgono più, si rifanno in coda:
 * l'app intanto la mostra dal vivo.
 */
async function changeDesign(
  deps: Deps,
  identity: Identity,
  contentId: string,
  change: (design: VisualDesign) => VisualDesign,
): Promise<Content> {
  const { content, render } = await inTransaction(deps, identity, async (db) => {
    const current = await requireContent(db, contentId);
    assertEditable(current);
    const next = applyRule(() => change(requireDesign(current)));
    const saved = await saveContent(db, withDesign(current, next));
    const render = next.status === 'ready' && next.renders.length === 0;
    if (render) await enqueue(db, identity, saved, 'render');
    return { content: saved, render };
  });
  if (render) deps.visualJobs.wake();
  return content;
}

export function editVisual(deps: Deps, identity: Identity, contentId: string, edit: VisualEdit): Promise<Content> {
  return changeDesign(deps, identity, contentId, (design) => editDesign(design, edit));
}

/** «Aggiorna il visivo»: i testi della bozza rifatta nella card, poi i PNG in coda. */
export function refreshVisual(deps: Deps, identity: Identity, contentId: string): Promise<Content> {
  return changeDesign(deps, identity, contentId, (design) => refreshDesign(design));
}

/** Per le bozze nate prima dei visivi: una proposta dai testi della bozza, senza AI. */
export function proposeVisual(deps: Deps, identity: Identity, contentId: string): Promise<Content> {
  return inTransaction(deps, identity, async (db) => {
    const current = await requireContent(db, contentId);
    if (current.visual.design) return current;
    assertEditable(current);
    const design = fallbackDesign(current.format, current.visual.headline || current.title, current.visual.slides);
    if (!design) throw ApiError.invalid('Un video non ha una card.');
    return saveContent(db, withDesign(current, design));
  });
}

/** Stato `creating` e lavoro in coda nella stessa transazione: partono tutti e due o nessuno. */
async function startCreation(
  deps: Deps,
  identity: Identity,
  contentId: string,
  prepare: (design: VisualDesign) => VisualDesign,
): Promise<Content> {
  const { content, queued } = await inTransaction(deps, identity, async (db) => {
    const current = await requireContent(db, contentId);
    assertEditable(current);
    const design = applyRule(() => prepare(requireDesign(current)));
    if (design.status === 'creating') return { content: current, queued: false };
    assertCanCreate(deps, design);
    const creating: VisualDesign = { ...design, status: 'creating', step: creationSteps(design)[0], error: null, renders: [] };
    const saved = await saveContent(db, withDesign(current, creating));
    await enqueue(db, identity, saved, 'create');
    return { content: saved, queued: true };
  });
  if (queued) deps.visualJobs.wake();
  return content;
}

export function createVisual(deps: Deps, identity: Identity, contentId: string): Promise<Content> {
  return startCreation(deps, identity, contentId, (design) => design);
}

/**
 * Il visivo disegnato da capo, un canale alla volta. L'agente guarda le card d'esempio e scrive un
 * template per questo contenuto; poi si mette in coda come sempre per foto e PNG. Il disegno non
 * passa dalla transazione: ci mette minuti, e tenere aperta una transazione tutto quel tempo
 * bloccherebbe la riga del contenuto a chiunque altro.
 */
export async function designContentVisual(
  deps: Deps,
  identity: Identity,
  contentId: string,
  channels: readonly ChannelId[],
  instruction: string | undefined,
  onSteps?: OnAiSteps,
): Promise<Content> {
  const { content, brand } = await inTransaction(deps, identity, async (db) => {
    const current = await requireContent(db, contentId);
    assertEditable(current);
    if (current.format === 'video') throw ApiError.invalid('Un video non ha una card.');
    return { content: current, brand: await requireBrand(db, current.brandId) };
  });

  // Un contenuto ha un disegno solo, reso poi in tutti i formati che i suoi canali chiedono: i canali
  // qui dicono per quali formati deve reggere, non quanti disegni fare.
  const wanted = channels.length > 0 ? channels : content.channels;
  const output = await designVisual(
    deps.ai,
    { accountId: identity.accountId, brandId: content.brandId },
    { brand, content, channels: wanted, instruction, onSteps },
  );
  const design = designFromOutput(output, content.visual.design ?? null);

  return inTransaction(deps, identity, async (db) => {
    const fresh = await requireContent(db, contentId);
    assertEditable(fresh);
    return saveContent(db, withDesign(fresh, design));
  });
}

/** «Rigenera»: via la foto generata, stessa descrizione, stessi layout e testi. */
export function regenerateVisualImage(deps: Deps, identity: Identity, contentId: string): Promise<Content> {
  return startCreation(deps, identity, contentId, (design) => withoutPhoto(design));
}

/** «Usa una tua foto»: il file va nello Storage prima, il contenuto si aggiorna dopo, rileggendolo. */
export async function uploadVisualPhoto(deps: Deps, identity: Identity, contentId: string, dataUri: string): Promise<Content> {
  const photo = parsePhotoDataUri(dataUri);
  const current = await inTransaction(deps, identity, (db) => requireContent(db, contentId));
  assertEditable(current);
  if (requireDesign(current).status === 'creating') throw ApiError.conflict('VISUAL_BUSY', new VisualBusyError().message);

  const path = mediaPath(identity.accountId, current.brandId, photo.mimeType);
  try {
    await deps.media.storage.upload(path, photo.bytes, photo.mimeType);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, 'UPLOAD_FAILED', 'Non sono riuscito a salvare la foto. Riprova.');
  }

  return inTransaction(deps, identity, async (db) => {
    const fresh = await requireContent(db, contentId);
    assertEditable(fresh);
    const next = applyRule(() => withUploadedPhoto(requireDesign(fresh), { path, url: '' }));
    return saveContent(db, withDesign(fresh, next));
  });
}
