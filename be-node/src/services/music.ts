import { randomUUID } from 'node:crypto';

import type { Brand, BrandTrack } from '@/domain/brand';
import { MUSIC_STEPS, createStepLog, stepsInSequence } from '@/services/ai-steps';
import type { OnAiSteps } from '@/services/types';

import { planBrandMusic } from '../ai/music';
import { ApiError } from '../contract/errors';
import { requireBrand, updateSection } from '../data/brands';
import type { Identity } from '../db/identity';
import { mediaPath, signBrand } from '../visual/files';
import { aiMeta, inTransaction, type Deps } from './deps';
import { withVideoProfile } from './video-profile';

/**
 * La musica del brand: una piccola libreria di tracce strumentali, non una traccia per video. Nasce al primo montaggio
 * (o dal Profilo), dal «come suona» del profilo video: l'AI scrive il piano, ElevenLabs compone le tracce in parallelo,
 * e finiscono nella libreria del brand.
 */

async function composeLibrary(deps: Deps, identity: Identity, brand: Brand, onSteps?: OnAiSteps): Promise<BrandTrack[]> {
  const meta = aiMeta(identity, brand.id);
  const steps = stepsInSequence(onSteps);
  const planned = await planBrandMusic(deps.ai, meta, brand, steps.first);

  const log = createStepLog(steps.then);
  const made = await Promise.all(
    planned.map(async (track, index): Promise<BrandTrack | null> => {
      const step = `track-${index}`;
      log.start(step, MUSIC_STEPS.track(track.mood), `${track.bpm} bpm`);
      try {
        const audio = await deps.media.music.compose(track, meta);
        const path = mediaPath(identity.accountId, brand.id, audio.mimeType);
        await deps.media.storage.upload(path, audio.bytes, audio.mimeType);
        log.finish(step);
        const seconds = Math.round(track.sections.reduce((total, section) => total + section.seconds, 0));
        return { id: randomUUID(), mood: track.mood, bpm: track.bpm, seconds, file: { path, url: '' } };
      } catch {
        log.finish(step, { failed: true });
        return null;
      }
    }),
  );
  const tracks = made.filter((track): track is BrandTrack => track !== null);
  if (tracks.length === 0) throw new ApiError(502, 'MUSIC_FAILED', 'Non sono riuscito a comporre la musica. Riprova.');
  return tracks;
}

async function saveLibrary(deps: Deps, identity: Identity, brandId: string, music: BrandTrack[]): Promise<Brand> {
  return inTransaction(deps, identity, async (db) => {
    const fresh = await requireBrand(db, brandId);
    const updated = await updateSection(db, brandId, { key: 'visual', value: { ...fresh.visual, music } });
    if (!updated) throw ApiError.notFound('Brand non trovato.');
    return updated;
  });
}

/**
 * Il brand con la sua musica, per chi monta: se manca e si può comporre, si compone adesso. Se la musica non è
 * configurata il video si monta senza, come prima.
 */
export async function withBrandMusic(deps: Deps, identity: Identity, brand: Brand, onSteps?: OnAiSteps): Promise<Brand> {
  if ((brand.visual.music?.length ?? 0) > 0 || !deps.media.music.available) return brand;
  const music = await composeLibrary(deps, identity, brand, onSteps);
  return saveLibrary(deps, identity, brand.id, music);
}

/** «Rifai la musica» dal Profilo: una libreria nuova al posto di quella di prima. */
export async function remakeBrandMusic(deps: Deps, identity: Identity, brandId: string, onSteps?: OnAiSteps): Promise<Brand> {
  if (!deps.media.music.available) throw ApiError.unavailable('MUSIC_UNAVAILABLE', 'La musica non è configurata su questo server.');
  const stored = await inTransaction(deps, identity, (db) => requireBrand(db, brandId));
  // La musica nasce dal «come suona»: senza profilo video, prima quello.
  const steps = stepsInSequence(onSteps);
  const brand = stored.visual.video ? stored : await withVideoProfile(deps, identity, stored, steps.first);
  const music = await composeLibrary(deps, identity, brand, stored.visual.video ? onSteps : steps.then);
  return signBrand(deps.media.storage, await saveLibrary(deps, identity, brandId, music));
}
