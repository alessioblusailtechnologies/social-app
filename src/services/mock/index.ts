import type { Brand, ChannelId, Identity } from '@/domain/brand';
import { applyPatch } from '@/domain/brand';
import type { Idea, IdeaDraft, IdeaStatus } from '@/domain/idea';
import {
  buildSkeleton,
  channelsWithIdea,
  fillSkeleton,
  placeIdea,
  selectedChannels,
  type PlanSlot,
  type SlotDraft,
  type SlotOrigin,
} from '@/domain/plan';
import { today } from '@/lib/dates';
import { delay, latency } from '@/lib/delay';
import { createId } from '@/lib/id';

import type { BrandService, ChannelService, IdeaService, PlanService, Services } from '../types';
import { createMockAiService } from './ai';
import { clearDatabase, ideasCollection, readDatabase, slotsCollection, writeDatabase } from './database';
import { createDemoBrand, createDemoIdeas, createDemoPlan } from './fixtures';
import { draftsFromSource, generateIdeaDrafts } from './idea-generator';

async function brandById(brandId: string): Promise<Brand> {
  const brand = (await readDatabase()).brands.find((candidate) => candidate.id === brandId);
  if (!brand) throw new Error('Brand non trovato');
  return brand;
}

function createMockBrandService(): BrandService {
  return {
    async getWorkspace() {
      await delay(latency(150, 300));
      return readDatabase();
    },

    async createBrand(draft) {
      await delay(latency(900, 1300));
      const now = new Date().toISOString();
      const brand: Brand = { ...draft, id: createId('brand'), createdAt: now, updatedAt: now };
      const database = await readDatabase();
      await writeDatabase({ brands: [...database.brands, brand], activeBrandId: brand.id });
      return brand;
    },

    async updateSection(brandId, patch) {
      await delay(latency(500, 800));
      const database = await readDatabase();
      const current = database.brands.find((brand) => brand.id === brandId);
      if (!current) throw new Error('Brand non trovato');
      const updated = { ...applyPatch(current, patch), updatedAt: new Date().toISOString() };
      await writeDatabase({
        ...database,
        brands: database.brands.map((brand) => (brand.id === brandId ? updated : brand)),
      });
      return updated;
    },

    async setActiveBrand(brandId) {
      await delay(latency(150, 250));
      const database = await readDatabase();
      await writeDatabase({ ...database, activeBrandId: brandId });
    },

    async loadDemoBrand() {
      await delay(latency(500, 800));
      const brand = createDemoBrand();
      const database = await readDatabase();
      await writeDatabase({ brands: [...database.brands, brand], activeBrandId: brand.id });
      const demoIdeas = createDemoIdeas(brand);
      const plan = createDemoPlan(brand, demoIdeas, today());
      await ideasCollection.update((ideas) => ({
        items: [...demoIdeas, ...plan.ideas, ...ideas],
        result: null,
      }));
      await slotsCollection.update((slots) => ({ items: [...slots, ...plan.slots], result: null }));
      return brand;
    },

    async resetDemo() {
      await delay(300);
      await clearDatabase();
    },
  };
}

function toIdea(draft: IdeaDraft, brandId: string, status: IdeaStatus, now: Date, index: number): Idea {
  return {
    ...draft,
    id: createId('idea'),
    brandId,
    // Un millisecondo di scarto per tenere l'ordine del gruppo.
    createdAt: new Date(now.getTime() - index).toISOString(),
    status,
    decidedAt: status === 'new' ? null : now.toISOString(),
  };
}

function createMockIdeaService(): IdeaService {
  return {
    async list(brandId) {
      await delay(latency(200, 400));
      return (await ideasCollection.list())
        .filter((idea) => idea.brandId === brandId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async generate(brandId, count = 8) {
      const brand = await brandById(brandId);
      await delay(latency(2200, 3000));
      return ideasCollection.update((ideas) => {
        const now = new Date();
        const existing = ideas.filter((idea) => idea.brandId === brandId);
        const created = generateIdeaDrafts(brand, existing, { count, now }).map((draft, i) =>
          toIdea(draft, brandId, 'new', now, i),
        );
        return { items: [...created, ...ideas], result: created };
      });
    },

    async draftFromSource(brandId, source, variant = 0) {
      const brand = await brandById(brandId);
      await delay(latency(1800, 2600));
      return draftsFromSource(brand, source, variant);
    },

    async save(brandId, drafts) {
      await delay(latency(400, 700));
      return ideasCollection.update((ideas) => {
        const now = new Date();
        const created = drafts.map((draft, i) => toIdea(draft, brandId, 'saved', now, i));
        return { items: [...created, ...ideas], result: created };
      });
    },

    async setStatus(ideaId, status) {
      await delay(latency(120, 220));
      return ideasCollection.update((ideas) => {
        const idea = ideas.find((candidate) => candidate.id === ideaId);
        if (!idea) throw new Error('Idea non trovata');
        const updated: Idea = { ...idea, status, decidedAt: status === 'new' ? null : new Date().toISOString() };
        return { items: ideas.map((candidate) => (candidate.id === ideaId ? updated : candidate)), result: updated };
      });
    },
  };
}

function toSlot(draft: SlotDraft, brandId: string, origin: SlotOrigin): PlanSlot {
  return {
    ...draft,
    id: createId('slot'),
    brandId,
    status: draft.ideaId ? 'toPrepare' : 'empty',
    origin,
    createdAt: new Date().toISOString(),
  };
}

const bySchedule = (a: PlanSlot, b: PlanSlot) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time);

function createMockPlanService(): PlanService {
  return {
    async list(brandId) {
      await delay(latency(200, 400));
      return (await slotsCollection.list()).filter((slot) => slot.brandId === brandId).sort(bySchedule);
    },

    async propose(brandId, request) {
      const brand = await brandById(brandId);
      await delay(latency(1600, 2200));
      const [slots, ideas] = await Promise.all([slotsCollection.list(), ideasCollection.list()]);
      const own = slots.filter((slot) => slot.brandId === brandId);
      const skeleton = buildSkeleton(brand, request, own);
      return fillSkeleton(
        skeleton,
        ideas.filter((idea) => idea.brandId === brandId),
        own,
        request.channels.length > 0 ? request.channels : selectedChannels(brand),
      );
    },

    async confirm(brandId, drafts) {
      await delay(latency(500, 800));
      return slotsCollection.update((slots) => {
        const created = drafts.map((draft) => toSlot(draft, brandId, 'session'));
        return { items: [...slots, ...created], result: created };
      });
    },

    async addIdea(brandId, ideaId) {
      const brand = await brandById(brandId);
      await delay(latency(400, 700));
      const idea = (await ideasCollection.list()).find((candidate) => candidate.id === ideaId);
      if (!idea) throw new Error('Idea non trovata');
      return slotsCollection.update((slots) => {
        const placement = placeIdea(brand, idea, slots, today());
        const target = 'slotId' in placement ? slots.find((slot) => slot.id === placement.slotId) : undefined;
        if (target) {
          const filled: PlanSlot = {
            ...target,
            ideaId,
            themeId: idea.themeId,
            status: 'toPrepare',
            channels: channelsWithIdea(target, idea, selectedChannels(brand)),
          };
          return { items: slots.map((slot) => (slot.id === filled.id ? filled : slot)), result: filled };
        }
        const draft = 'draft' in placement ? placement.draft : null;
        if (!draft) throw new Error('Nessuna uscita disponibile');
        const created = toSlot(draft, brandId, 'idea');
        return { items: [...slots, created], result: created };
      });
    },

    async addSlot(brandId, draft) {
      await delay(latency(300, 500));
      return slotsCollection.update((slots) => {
        const created = toSlot(draft, brandId, 'manual');
        return { items: [...slots, created], result: created };
      });
    },

    async updateSlot(slotId, patch) {
      await delay(latency(250, 450));
      return slotsCollection.update((slots) => {
        const current = slots.find((slot) => slot.id === slotId);
        if (!current) throw new Error('Uscita non trovata');
        const updated: PlanSlot = { ...current, ...patch };
        // Lo stato segue l'idea: senza idea l'uscita torna da riempire.
        if (patch.ideaId !== undefined && patch.status === undefined) {
          updated.status = patch.ideaId === null ? 'empty' : current.status === 'empty' ? 'toPrepare' : current.status;
        }
        return { items: slots.map((slot) => (slot.id === slotId ? updated : slot)), result: updated };
      });
    },

    async removeSlot(slotId) {
      await delay(latency(250, 450));
      await slotsCollection.update((slots) => ({ items: slots.filter((slot) => slot.id !== slotId), result: null }));
    },
  };
}

const ACCENTS: [RegExp, string][] = [
  [/[àá]/g, 'a'],
  [/[èé]/g, 'e'],
  [/[ìí]/g, 'i'],
  [/[òó]/g, 'o'],
  [/[ùú]/g, 'u'],
];

function createMockChannelService(): ChannelService {
  return {
    async connect(_channel: ChannelId, identity: Identity) {
      await delay(latency(900, 1300));
      let slug = identity.name.toLowerCase();
      for (const [pattern, letter] of ACCENTS) slug = slug.replace(pattern, letter);
      slug = slug.replace(/[^a-z0-9]/g, '');
      return { handle: `@${slug || 'account'}` };
    },
  };
}

export function createMockServices(): Services {
  return {
    brands: createMockBrandService(),
    ideas: createMockIdeaService(),
    plan: createMockPlanService(),
    ai: createMockAiService(),
    channels: createMockChannelService(),
  };
}
