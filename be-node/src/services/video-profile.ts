import type { Brand, BrandVideo } from '@/domain/brand';
import type { OnAiSteps, VideoProfileRequest } from '@/services/types';

import { videoRequestFrom, writeVideoProfile } from '../ai/video-profile';
import { ApiError } from '../contract/errors';
import { requireBrand, updateSection } from '../data/brands';
import type { Identity } from '../db/identity';
import { aiMeta, inTransaction, type Deps } from './deps';

/**
 * Il profilo video del brand. Nell'onboarding nasce con la linea, dal Profilo si rifà, e un brand che non ce l'ha
 * (quelli salvati prima del Video Studio) lo riceve al primo video, prima della regia che lo usa.
 */

/** Dal Profilo o dall'onboarding: si restituisce e basta, lo salva chi salva la sezione. */
export function proposeVideoProfile(deps: Deps, identity: Identity, request: VideoProfileRequest, onSteps?: OnAiSteps): Promise<BrandVideo> {
  return writeVideoProfile(deps.ai, aiMeta(identity), request, onSteps);
}

/** Il brand col suo profilo video: se manca si scrive adesso e si salva, sul brand com'è in quel momento. */
export async function withVideoProfile(deps: Deps, identity: Identity, brand: Brand, onSteps?: OnAiSteps): Promise<Brand> {
  if (brand.visual.video) return brand;
  const video = await writeVideoProfile(deps.ai, aiMeta(identity, brand.id), videoRequestFrom(brand), onSteps);
  return inTransaction(deps, identity, async (db) => {
    const fresh = await requireBrand(db, brand.id);
    // Se nel frattempo l'utente l'ha scritto a mano, vince il suo.
    if (fresh.visual.video) return fresh;
    const updated = await updateSection(db, brand.id, { key: 'visual', value: { ...fresh.visual, video } });
    if (!updated) throw ApiError.notFound('Brand non trovato.');
    return updated;
  });
}
