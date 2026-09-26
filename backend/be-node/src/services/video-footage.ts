import { FOOTAGE_TYPES, footageKind, readScene, type Content, type VideoScene } from '@shared/domain/content';
import type { OnAiSteps } from '@shared/services/types';

import { replaceScene } from '../ai/video-scene';
import { ApiError } from '../contract/errors';
import { requireBrand } from '../data/brands';
import { requireContent, saveContent } from '../data/contents';
import type { Identity } from '../db/identity';
import { MEDIA_EXTENSIONS, mediaPath } from '../visual/files';
import { aiMeta, inTransaction, type Deps } from './deps';

/**
 * Il materiale vero delle scene: il girato di chi pubblica, o una sua foto per una foto viva. Un girato pesa troppo
 * per passare dall'API: l'app chiede un indirizzo di caricamento, carica il file direttamente nel bucket e poi dice
 * quale percorso ha caricato. Il percorso lo decide il server, e alla conferma si ricontrolla che il file ci sia.
 */

/**
 * Il materiale si carica anche a contenuto approvato: si gira dopo aver deciso cosa girare, ed è proprio la Home a
 * chiederlo per le uscite programmate. Cambiare la regia invece no (`assertRegiaEditable`).
 */
function assertVideo(content: Content): void {
  if (content.format !== 'video') throw ApiError.invalid('Il materiale si carica solo per un video.');
}

function assertRegiaEditable(content: Content): void {
  assertVideo(content);
  if (content.status === 'approved') {
    throw ApiError.conflict('CONTENT_APPROVED', 'Il contenuto è approvato: riaprilo per cambiare la regia.');
  }
}

function requireScene(content: Content, index: number): VideoScene {
  const scene = content.visual.scenes[index];
  if (!scene) throw ApiError.notFound('Scena non trovata.');
  return readScene(scene);
}

export async function footageUploadUrl(
  deps: Deps,
  identity: Identity,
  contentId: string,
  index: number,
  file: { mimeType: string; bytes: number },
): Promise<{ path: string; uploadUrl: string }> {
  const content = await inTransaction(deps, identity, (db) => requireContent(db, contentId));
  assertVideo(content);
  const kind = footageKind(requireScene(content, index).source);
  if (!kind) throw ApiError.invalid('Questa scena non si carica: la grafica e il b-roll li faccio io.');
  const accepted = FOOTAGE_TYPES[kind];
  if (!accepted.mimeTypes.includes(file.mimeType)) {
    throw ApiError.invalid(kind === 'video' ? 'Il girato deve essere un MP4 o un MOV.' : 'La foto deve essere un PNG, un JPEG o un WebP.');
  }
  if (file.bytes > accepted.maxBytes) {
    throw new ApiError(413, 'TOO_LARGE', `Il file è troppo pesante: al massimo ${Math.round(accepted.maxBytes / 1024 / 1024)} MB.`);
  }

  const path = mediaPath(identity.accountId, content.brandId, file.mimeType);
  try {
    return { path, uploadUrl: await deps.media.storage.uploadUrl(path) };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, 'UPLOAD_FAILED', 'Non riesco a preparare il caricamento. Riprova.');
  }
}

/** Il file caricato diventa il materiale della scena; `null` lo toglie. */
export async function attachFootage(deps: Deps, identity: Identity, contentId: string, index: number, path: string | null): Promise<Content> {
  if (path !== null) {
    const extension = path.split('.').pop()?.toLowerCase() ?? '';
    const known = Object.values(MEDIA_EXTENSIONS).includes(extension);
    const current = await inTransaction(deps, identity, (db) => requireContent(db, contentId));
    // Solo un percorso del brand, con un'estensione nostra, e un file che c'è davvero.
    if (!known || !path.startsWith(`${identity.accountId}/${current.brandId}/`)) throw ApiError.invalid('Questo file non è tuo.');
    const signed = await deps.media.storage.sign([path]).catch(() => new Map<string, string>());
    if (!signed.has(path)) throw ApiError.invalid('Il file non è arrivato: caricalo di nuovo.');
  }

  return inTransaction(deps, identity, async (db) => {
    const content = await requireContent(db, contentId);
    assertVideo(content);
    const scene = requireScene(content, index);
    const kind = footageKind(scene.source);
    if (!kind) throw ApiError.invalid('Questa scena non si carica.');
    if (path !== null) {
      const extension = path.split('.').pop()?.toLowerCase() ?? '';
      const fits = FOOTAGE_TYPES[kind].mimeTypes.some((mimeType) => MEDIA_EXTENSIONS[mimeType] === extension);
      if (!fits) throw ApiError.invalid(kind === 'video' ? 'Qui ci va un video.' : 'Qui ci va una foto.');
    }
    const scenes = content.visual.scenes.map((candidate, position) =>
      position === index ? { ...scene, footage: path === null ? null : { path, url: '' } } : candidate,
    );
    return saveContent(db, { ...content, visual: { ...content.visual, scenes } });
  });
}

/**
 * «Non posso girarla»: la scena si rifà con un'altra strada (foto viva, b-roll di contorno, grafica). Come le altre
 * generazioni lunghe, legge in una transazione, genera fuori e scrive in un'altra.
 */
export async function replaceShootScene(
  deps: Deps,
  identity: Identity,
  contentId: string,
  index: number,
  onSteps?: OnAiSteps,
): Promise<Content> {
  const { content, brand } = await inTransaction(deps, identity, async (db) => {
    const content = await requireContent(db, contentId);
    return { content, brand: await requireBrand(db, content.brandId) };
  });
  assertRegiaEditable(content);
  if (requireScene(content, index).source !== 'shoot') throw ApiError.invalid('Si rifà solo una scena da girare.');

  const scene = await replaceScene(deps.ai, aiMeta(identity, content.brandId), { brand, content, index, onSteps });

  return inTransaction(deps, identity, async (db) => {
    const fresh = await requireContent(db, contentId);
    assertRegiaEditable(fresh);
    // La regia è cambiata nel frattempo (bozza rifatta): la scena di prima non c'è più, meglio dirlo.
    if (fresh.visual.scenes.length !== content.visual.scenes.length || fresh.visual.scenes[index]?.source !== 'shoot') {
      throw ApiError.conflict('SCENES_CHANGED', 'La regia è cambiata mentre rifacevo la scena: riprova.');
    }
    const scenes = fresh.visual.scenes.map((candidate, position) => (position === index ? scene : candidate));
    return saveContent(db, { ...fresh, visual: { ...fresh.visual, scenes } });
  });
}
