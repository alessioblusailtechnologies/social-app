import type { Brand, BrandDraft, SectionPatch } from '@/domain/brand';
import type { Idea } from '@/domain/idea';
import { toDay } from '@/lib/dates';
import { generateContent } from '@/services/mock/content-generator';
import { createDemoBrand, createDemoIdeas, createDemoPlan } from '@/services/mock/fixtures';
import type { Workspace } from '@/services/types';

import { ApiError } from '../contract/errors';
import { findAccount, setActiveBrand } from '../data/accounts';
import { deleteBrands, insertBrand, listBrands, requireBrand, updateSection } from '../data/brands';
import { insertContent } from '../data/contents';
import { insertIdea } from '../data/ideas';
import { insertSlot } from '../data/slots';
import type { Identity } from '../db/identity';
import { inTransaction, type Deps } from './deps';

/** I brand dell'account e quello attivo. */

export function getWorkspace(deps: Deps, identity: Identity): Promise<Workspace> {
  return inTransaction(deps, identity, async (db) => {
    const brands = await listBrands(db, identity.accountId);
    const account = await findAccount(db, identity.accountId);
    return { brands, activeBrandId: account?.activeBrandId ?? null };
  });
}

/** Crea il brand e lo rende attivo. */
export function createBrand(deps: Deps, identity: Identity, draft: BrandDraft): Promise<Brand> {
  return inTransaction(deps, identity, async (db) => {
    const brand = await insertBrand(db, identity.accountId, draft);
    await setActiveBrand(db, identity.accountId, brand.id);
    return brand;
  });
}

export function updateBrandSection(deps: Deps, identity: Identity, brandId: string, patch: SectionPatch): Promise<Brand> {
  return inTransaction(deps, identity, async (db) => {
    const brand = await updateSection(db, brandId, patch);
    if (!brand) throw ApiError.notFound('Brand non trovato.');
    return brand;
  });
}

export function chooseActiveBrand(deps: Deps, identity: Identity, brandId: string): Promise<void> {
  return inTransaction(deps, identity, async (db) => {
    await requireBrand(db, brandId);
    await setActiveBrand(db, identity.accountId, brandId);
  });
}

/**
 * Il profilo di esempio, con le stesse fixture del mock: idee, piano e bozze arrivano
 * subito, senza passare dall'AI. Gli id delle fixture si sostituiscono con quelli del database.
 */
export function loadDemoBrand(deps: Deps, identity: Identity): Promise<Brand> {
  return inTransaction(deps, identity, async (db) => {
    const now = deps.now();
    const { accountId } = identity;
    const brand = await insertBrand(db, accountId, createDemoBrand());
    const ids = new Map<string, string>();

    const saveIdeas = async (ideas: readonly Idea[]) => {
      const saved: Idea[] = [];
      for (const idea of ideas) {
        const created = await insertIdea(db, accountId, brand.id, {
          draft: idea,
          status: idea.status,
          createdAt: new Date(idea.createdAt),
          decidedAt: idea.decidedAt ? new Date(idea.decidedAt) : null,
        });
        ids.set(idea.id, created.id);
        saved.push(created);
      }
      return saved;
    };

    const demoIdeas = await saveIdeas(createDemoIdeas(brand));
    const plan = createDemoPlan(brand, demoIdeas, toDay(now));
    const ideas = [...demoIdeas, ...(await saveIdeas(plan.ideas))];

    for (const slot of plan.slots) {
      const ideaId = slot.ideaId ? (ids.get(slot.ideaId) ?? slot.ideaId) : null;
      const saved = await insertSlot(db, accountId, brand.id, { ...slot, ideaId }, now);
      const idea = ideas.find((candidate) => candidate.id === ideaId);
      // Le uscite già avanti hanno la loro bozza: in approvazione, oppure approvata.
      if (!idea || slot.status === 'toPrepare' || slot.status === 'empty') continue;
      const approved = slot.status !== 'toApprove';
      await insertContent(db, accountId, brand.id, {
        slotId: saved.id,
        ideaId: idea.id,
        brief: null,
        title: idea.title,
        themeId: idea.themeId,
        channels: slot.channels,
        ...generateContent(brand, idea, slot.channels, idea.formats[0] ?? 'post', 0),
        status: approved ? 'approved' : 'draft',
        revision: 0,
        approvedAt: approved ? now.toISOString() : null,
      });
    }

    await setActiveBrand(db, accountId, brand.id);
    return brand;
  });
}

/** "Azzera i dati": tutti i brand dell'account, e con loro idee, piano e contenuti. */
export function resetDemo(deps: Deps, identity: Identity): Promise<void> {
  return inTransaction(deps, identity, (db) => deleteBrands(db, identity.accountId));
}
