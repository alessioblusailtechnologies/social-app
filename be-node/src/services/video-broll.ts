import { BROLL_MONTHLY_LIMITS, readScene, type Content, type VideoScene } from '@/domain/content';
import type { OnAiSteps } from '@/services/types';

import { brollClip, brollFrame } from '../ai/video-broll';
import { ApiError } from '../contract/errors';
import { requireBrand } from '../data/brands';
import { requireContent, saveContent } from '../data/contents';
import { countThisMonth } from '../data/usage';
import type { Identity } from '../db/identity';
import { aiMeta, inTransaction, type Deps } from './deps';

/**
 * Il b-roll di una scena. Due gesti, due lavori in coda: il fotogramma (poco, si guarda e si approva) e la clip che lo
 * mette in movimento (è lì che si spende). Rifare il fotogramma butta la clip, che partiva dall'altro. Il lucchetto
 * ferma tutto su una scena che va bene. Come il girato, si fa anche a contenuto approvato: è materiale, non regia.
 */

function requireBroll(content: Content, index: number): VideoScene {
  if (content.format !== 'video') throw ApiError.invalid('Il b-roll è solo per i video.');
  const raw = content.visual.scenes[index];
  if (!raw) throw ApiError.notFound('Scena non trovata.');
  const scene = readScene(raw);
  if (scene.source !== 'broll') throw ApiError.invalid('Questa scena non è di b-roll.');
  return scene;
}

function assertUnlocked(scene: VideoScene): void {
  if (scene.locked) throw ApiError.conflict('SCENE_LOCKED', 'La scena è bloccata: togli il lucchetto per rifarla.');
}

/** Il tetto del mese: si dice prima, non dopo aver speso. */
async function assertBudget(deps: Deps, identity: Identity, task: 'video-frame' | 'video-clip'): Promise<void> {
  const used = await countThisMonth(deps.pool, identity.accountId, task);
  const limit = task === 'video-frame' ? BROLL_MONTHLY_LIMITS.frames : BROLL_MONTHLY_LIMITS.clips;
  if (used >= limit) {
    throw new ApiError(
      429,
      'BROLL_LIMIT',
      task === 'video-frame'
        ? `Hai usato i ${limit} fotogrammi di questo mese: il conto riparte il primo del mese.`
        : `Hai usato le ${limit} clip di questo mese: il conto riparte il primo del mese.`,
    );
  }
}

/** Le foto vere del brand, firmate, come riferimento di stile per il fotogramma. */
async function brandReferences(deps: Deps, identity: Identity, content: Content): Promise<string[]> {
  const brand = await inTransaction(deps, identity, (db) => requireBrand(db, content.brandId));
  const paths = [...(brand.visual.examples ?? []).map((example) => example.photo?.path), ...(brand.visual.references ?? []).map((file) => file.path)]
    .filter((path): path is string => Boolean(path?.startsWith(`${identity.accountId}/`)))
    .slice(0, 3);
  const urls = await deps.media.storage.sign(paths).catch(() => new Map<string, string>());
  return paths.flatMap((path) => (urls.has(path) ? [urls.get(path)!] : []));
}

function withScene(content: Content, index: number, change: (scene: VideoScene) => VideoScene): Content {
  const scenes = content.visual.scenes.map((scene, position) => (position === index ? change(readScene(scene)) : scene));
  return { ...content, visual: { ...content.visual, scenes } };
}

/** «Crea il fotogramma» (o «Rifai il fotogramma»): la clip di prima, se c'era, se ne va con lui. */
export async function makeBrollFrame(deps: Deps, identity: Identity, contentId: string, index: number, onSteps?: OnAiSteps): Promise<Content> {
  const { content, brand } = await inTransaction(deps, identity, async (db) => {
    const content = await requireContent(db, contentId);
    return { content, brand: await requireBrand(db, content.brandId) };
  });
  assertUnlocked(requireBroll(content, index));
  await assertBudget(deps, identity, 'video-frame');

  const references = await brandReferences(deps, identity, content);
  const path = await brollFrame(deps.ai, aiMeta(identity, content.brandId), { brand, content, index, references, onSteps });

  return inTransaction(deps, identity, async (db) => {
    const fresh = await requireContent(db, contentId);
    assertUnlocked(requireBroll(fresh, index));
    return saveContent(db, withScene(fresh, index, (scene) => ({ ...scene, frame: { path, url: '' }, clip: null })));
  });
}

/** «Anima la scena» (o «Un'altra ripresa»): dal fotogramma approvato. */
export async function makeBrollClip(deps: Deps, identity: Identity, contentId: string, index: number, onSteps?: OnAiSteps): Promise<Content> {
  const { content, brand } = await inTransaction(deps, identity, async (db) => {
    const content = await requireContent(db, contentId);
    return { content, brand: await requireBrand(db, content.brandId) };
  });
  const scene = requireBroll(content, index);
  assertUnlocked(scene);
  const framePath = scene.frame?.path;
  if (!framePath) throw ApiError.invalid('Prima crea il fotogramma: la clip parte da lì.');
  await assertBudget(deps, identity, 'video-clip');

  const frameUrl = (await deps.media.storage.sign([framePath])).get(framePath);
  if (!frameUrl) throw new ApiError(502, 'MEDIA_UNAVAILABLE', 'Non riesco a leggere il fotogramma. Riprova.');
  const path = await brollClip(deps.ai, aiMeta(identity, content.brandId), { brand, content, index, references: [], frameUrl, onSteps });

  return inTransaction(deps, identity, async (db) => {
    const fresh = await requireContent(db, contentId);
    const current = requireBroll(fresh, index);
    assertUnlocked(current);
    // Rifatto il fotogramma nel frattempo: questa clip partiva dall'altro.
    if (current.frame?.path !== framePath) throw ApiError.conflict('FRAME_CHANGED', 'Il fotogramma è cambiato mentre giravo: rianima la scena.');
    return saveContent(db, withScene(fresh, index, (candidate) => ({ ...candidate, clip: { path, url: '' } })));
  });
}

/** Il lucchetto: la scena va bene così, e non si rigenera più finché non si toglie. */
export function lockBrollScene(deps: Deps, identity: Identity, contentId: string, index: number, locked: boolean): Promise<Content> {
  return inTransaction(deps, identity, async (db) => {
    const content = await requireContent(db, contentId);
    const scene = requireBroll(content, index);
    if (locked && !scene.clip) throw ApiError.invalid('Si blocca una scena che ha la sua clip.');
    return saveContent(db, withScene(content, index, (candidate) => ({ ...candidate, locked })));
  });
}
