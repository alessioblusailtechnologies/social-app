import { cutKey, type Content } from '@/domain/content';
import { stepsInSequence } from '@/services/ai-steps';
import type { OnAiSteps } from '@/services/types';

import { cutVideo } from '../ai/video-cut';
import { ApiError } from '../contract/errors';
import { requireBrand } from '../data/brands';
import { requireContent, saveContent } from '../data/contents';
import type { Identity } from '../db/identity';
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
  const cut = await cutVideo(deps.ai, aiMeta(identity, content.brandId), {
    content,
    music: choice === null ? [] : picked.length > 0 ? picked : library,
    chosen: picked.length > 0 ? 'track' : choice === null ? 'none' : 'auto',
    onSteps: steps.then,
  });

  return inTransaction(deps, identity, async (db) => {
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
