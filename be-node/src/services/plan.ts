import {
  buildSkeleton,
  channelsWithIdea,
  fillSkeleton,
  placeIdea,
  selectedChannels,
  type PlanRequest,
  type PlanSlot,
  type SlotDraft,
  type SlotOrigin,
} from '@/domain/plan';
import { toDay } from '@/lib/dates';
import type { SlotPatch } from '@/services/types';

import { ApiError } from '../contract/errors';
import { releaseContentOf } from '../data/contents';
import { requireBrand } from '../data/brands';
import { listIdeas, requireIdea } from '../data/ideas';
import { deleteSlot, insertSlot, listSlots, requireSlot, saveSlot, type NewSlot } from '../data/slots';
import type { Identity } from '../db/identity';
import { inTransaction, type Deps } from './deps';

/**
 * Il piano. Le regole (scheletro, equilibrio dei temi, dove mettere un'idea) sono quelle di
 * `src/domain/plan.ts`, le stesse del mock: qui c'è solo la persistenza.
 */

function fromDraft(draft: SlotDraft, origin: SlotOrigin): NewSlot {
  return { ...draft, contentTitle: null, status: draft.ideaId ? 'toPrepare' : 'empty', origin };
}

export function listPlan(deps: Deps, identity: Identity, brandId: string): Promise<PlanSlot[]> {
  return inTransaction(deps, identity, async (db) => {
    await requireBrand(db, brandId);
    return listSlots(db, brandId, deps.now());
  });
}

/** Scheletro del periodo già riempito con le idee salvate: niente si salva finché non si conferma. */
export function proposePlan(deps: Deps, identity: Identity, brandId: string, request: PlanRequest): Promise<SlotDraft[]> {
  return inTransaction(deps, identity, async (db) => {
    const brand = await requireBrand(db, brandId);
    const slots = await listSlots(db, brandId, deps.now());
    const ideas = await listIdeas(db, brandId);
    const allowed = request.channels.length > 0 ? request.channels : selectedChannels(brand);
    return fillSkeleton(buildSkeleton(brand, request, slots), ideas, slots, allowed);
  });
}

export function confirmPlan(deps: Deps, identity: Identity, brandId: string, drafts: readonly SlotDraft[]): Promise<PlanSlot[]> {
  return inTransaction(deps, identity, async (db) => {
    await requireBrand(db, brandId);
    const created: PlanSlot[] = [];
    for (const draft of drafts) {
      created.push(await insertSlot(db, identity.accountId, brandId, fromDraft(draft, 'session'), deps.now()));
    }
    return created;
  });
}

/** "Aggiungi al piano" da un'idea: riempie un'uscita vuota adatta o ne crea una. */
export function addIdeaToPlan(deps: Deps, identity: Identity, brandId: string, ideaId: string): Promise<PlanSlot> {
  return inTransaction(deps, identity, async (db) => {
    const now = deps.now();
    const brand = await requireBrand(db, brandId);
    const idea = await requireIdea(db, ideaId);
    if (idea.brandId !== brandId) throw ApiError.notFound('Idea non trovata.');
    const slots = await listSlots(db, brandId, now);

    const placement = placeIdea(brand, idea, slots, toDay(now));
    if ('slotId' in placement) {
      const target = slots.find((slot) => slot.id === placement.slotId);
      if (!target) throw ApiError.conflict('NO_SLOT', 'Nessuna uscita disponibile.');
      return saveSlot(
        db,
        {
          ...target,
          ideaId,
          themeId: idea.themeId,
          status: 'toPrepare',
          channels: channelsWithIdea(target, idea, selectedChannels(brand)),
        },
        now,
      );
    }
    return insertSlot(db, identity.accountId, brandId, fromDraft(placement.draft, 'idea'), now);
  });
}

export function addSlot(deps: Deps, identity: Identity, brandId: string, draft: SlotDraft): Promise<PlanSlot> {
  return inTransaction(deps, identity, async (db) => {
    await requireBrand(db, brandId);
    return insertSlot(db, identity.accountId, brandId, fromDraft(draft, 'manual'), deps.now());
  });
}

export function updateSlot(deps: Deps, identity: Identity, slotId: string, patch: SlotPatch): Promise<PlanSlot> {
  return inTransaction(deps, identity, async (db) => {
    const now = deps.now();
    const current = await requireSlot(db, slotId, now);
    const next: PlanSlot = { ...current, ...patch };
    const ideaChanged = patch.ideaId !== undefined && patch.ideaId !== current.ideaId;
    if (ideaChanged && patch.ideaId) await requireIdea(db, patch.ideaId);
    // Cambiare idea invalida la bozza: l'uscita torna da preparare, o da riempire senza idea.
    if (ideaChanged && patch.status === undefined) next.status = patch.ideaId === null ? 'empty' : 'toPrepare';
    const saved = await saveSlot(db, next, now);
    if (ideaChanged) await releaseContentOf(db, slotId);
    return saved;
  });
}

export function removeSlot(deps: Deps, identity: Identity, slotId: string): Promise<void> {
  return inTransaction(deps, identity, async (db) => {
    // Prima il contenuto: cancellando l'uscita il suo aggancio sparirebbe.
    await releaseContentOf(db, slotId);
    if (!(await deleteSlot(db, slotId))) throw ApiError.notFound('Uscita non trovata.');
  });
}
