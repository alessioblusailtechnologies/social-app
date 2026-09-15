import type { Idea, IdeaDraft, IdeaSource, IdeaStatus } from '@/domain/idea';

import { draftIdeasFromSource, generateIdeas } from '../ai/ideas';
import { ApiError } from '../contract/errors';
import { requireBrand } from '../data/brands';
import { insertDrafts, listIdeas, updateIdeaStatus } from '../data/ideas';
import type { Identity } from '../db/identity';
import { aiMeta, inTransaction, type Deps } from './deps';

export function listBrandIdeas(deps: Deps, identity: Identity, brandId: string): Promise<Idea[]> {
  return inTransaction(deps, identity, async (db) => {
    await requireBrand(db, brandId);
    return listIdeas(db, brandId);
  });
}

/** L'AI propone nuove idee dal contesto del brand: finiscono tra le proposte. */
export async function generateBrandIdeas(deps: Deps, identity: Identity, brandId: string, count: number): Promise<Idea[]> {
  const { brand, existing } = await inTransaction(deps, identity, async (db) => ({
    brand: await requireBrand(db, brandId),
    existing: await listIdeas(db, brandId),
  }));
  const drafts = await generateIdeas(deps.ai, aiMeta(identity, brandId), brand, existing, count, deps.now());
  return inTransaction(deps, identity, (db) => insertDrafts(db, identity.accountId, brandId, drafts, 'new', deps.now()));
}

/** Spunti da una fonte dell'utente: non si salvano finché non li sceglie. */
export async function draftBrandIdeas(
  deps: Deps,
  identity: Identity,
  brandId: string,
  source: IdeaSource,
  variant: number,
): Promise<IdeaDraft[]> {
  const brand = await inTransaction(deps, identity, (db) => requireBrand(db, brandId));
  return draftIdeasFromSource(deps.ai, aiMeta(identity, brandId), brand, source, variant, deps.now());
}

export function saveBrandIdeas(deps: Deps, identity: Identity, brandId: string, drafts: readonly IdeaDraft[]): Promise<Idea[]> {
  return inTransaction(deps, identity, async (db) => {
    await requireBrand(db, brandId);
    return insertDrafts(db, identity.accountId, brandId, drafts, 'saved', deps.now());
  });
}

export function setIdeaStatus(deps: Deps, identity: Identity, ideaId: string, status: IdeaStatus): Promise<Idea> {
  return inTransaction(deps, identity, async (db) => {
    const idea = await updateIdeaStatus(db, ideaId, status, deps.now());
    if (!idea) throw ApiError.notFound('Idea non trovata.');
    return idea;
  });
}
