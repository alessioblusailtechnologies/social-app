import type { Brand, ChannelId, Identity } from '@/domain/brand';
import { applyPatch } from '@/domain/brand';
import type { Content } from '@/domain/content';
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
import { toDay, today } from '@/lib/dates';
import { delay, latency } from '@/lib/delay';
import { createId } from '@/lib/id';

import type { BrandService, ChannelService, ContentService, IdeaService, PlanService, Services } from '../types';
import { createMockAiService } from './ai';
import { generateContent, generateDirectContent, rewriteText } from './content-generator';
import {
  clearDatabase,
  contentsCollection,
  ideasCollection,
  readDatabase,
  slotsCollection,
  writeDatabase,
} from './database';
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

      // Le uscite già avanti hanno la loro bozza: in approvazione, oppure approvata.
      const allIdeas = [...demoIdeas, ...plan.ideas];
      const now = new Date().toISOString();
      const demoContents = plan.slots.flatMap((slot): Content[] => {
        const idea = allIdeas.find((candidate) => candidate.id === slot.ideaId);
        if (!idea || slot.status === 'toPrepare' || slot.status === 'empty') return [];
        const approved = slot.status !== 'toApprove';
        return [
          {
            id: createId('content'),
            brandId: brand.id,
            slotId: slot.id,
            ideaId: idea.id,
            brief: null,
            title: idea.title,
            themeId: idea.themeId,
            channels: slot.channels,
            ...generateContent(brand, idea, slot.channels, idea.formats[0] ?? 'post', 0),
            status: approved ? 'approved' : 'draft',
            revision: 0,
            createdAt: now,
            updatedAt: now,
            approvedAt: approved ? now : null,
          },
        ];
      });
      await contentsCollection.update((contents) => ({ items: [...contents, ...demoContents], result: null }));
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
      const now = new Date();
      const nowKey = `${toDay(now)}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      return (
        (await slotsCollection.list())
          .filter((slot) => slot.brandId === brandId)
          // Pubblicazione simulata: un'uscita programmata il cui orario è passato risulta pubblicata.
          .map((slot) =>
            slot.status === 'scheduled' && `${slot.date}T${slot.time}` < nowKey
              ? { ...slot, status: 'published' as const }
              : slot,
          )
          .sort(bySchedule)
      );
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
      const { slot, ideaChanged } = await slotsCollection.update((slots) => {
        const current = slots.find((candidate) => candidate.id === slotId);
        if (!current) throw new Error('Uscita non trovata');
        const next: PlanSlot = { ...current, ...patch };
        const changed = patch.ideaId !== undefined && patch.ideaId !== current.ideaId;
        // Cambiare idea invalida la bozza: l'uscita torna da preparare, o da riempire senza idea.
        if (changed && patch.status === undefined) next.status = patch.ideaId === null ? 'empty' : 'toPrepare';
        return {
          items: slots.map((candidate) => (candidate.id === slotId ? next : candidate)),
          result: { slot: next, ideaChanged: changed },
        };
      });
      if (ideaChanged) await releaseContentOf(slotId);
      return slot;
    },

    async removeSlot(slotId) {
      await delay(latency(250, 450));
      await slotsCollection.update((slots) => ({ items: slots.filter((slot) => slot.id !== slotId), result: null }));
      await releaseContentOf(slotId);
    },
  };
}

/**
 * Quando un'uscita sparisce o cambia idea: la bozza nata dall'idea non vale più e si elimina,
 * un contenuto creato direttamente torna tra le bozze da programmare.
 */
function releaseContentOf(slotId: string) {
  return contentsCollection.update((contents) => ({
    items: contents.flatMap((content): Content[] => {
      if (content.slotId !== slotId) return [content];
      if (content.ideaId !== null) return [];
      return [{ ...content, slotId: null, status: 'draft', approvedAt: null }];
    }),
    result: null,
  }));
}

function setSlotStatus(slotId: string, status: PlanSlot['status']): Promise<PlanSlot> {
  return slotsCollection.update((slots) => {
    const slot = slots.find((candidate) => candidate.id === slotId);
    if (!slot) throw new Error('Uscita non trovata');
    const updated: PlanSlot = { ...slot, status };
    return { items: slots.map((candidate) => (candidate.id === slotId ? updated : candidate)), result: updated };
  });
}

function updateContent(contentId: string, change: (content: Content) => Content): Promise<Content> {
  return contentsCollection.update((contents) => {
    const current = contents.find((content) => content.id === contentId);
    if (!current) throw new Error('Contenuto non trovato');
    const next: Content = { ...change(current), updatedAt: new Date().toISOString() };
    return { items: contents.map((content) => (content.id === contentId ? next : content)), result: next };
  });
}

function createMockContentService(): ContentService {
  return {
    async getForSlot(slotId) {
      await delay(latency(150, 300));
      return (await contentsCollection.list()).find((content) => content.slotId === slotId) ?? null;
    },

    async prepare(slotId, format) {
      const slot = (await slotsCollection.list()).find((candidate) => candidate.id === slotId);
      if (!slot?.ideaId) throw new Error('L’uscita non ha un’idea');
      const idea = (await ideasCollection.list()).find((candidate) => candidate.id === slot.ideaId);
      if (!idea) throw new Error('Idea non trovata');
      const brand = await brandById(slot.brandId);
      await delay(latency(2400, 3200));

      const content = await contentsCollection.update((contents) => {
        const previous = contents.find((candidate) => candidate.slotId === slotId);
        const revision = previous ? previous.revision + 1 : 0;
        const now = new Date().toISOString();
        const next: Content = {
          id: previous?.id ?? createId('content'),
          brandId: slot.brandId,
          slotId,
          ideaId: idea.id,
          brief: null,
          title: idea.title,
          themeId: idea.themeId,
          channels: slot.channels,
          ...generateContent(brand, idea, slot.channels, format ?? previous?.format ?? idea.formats[0] ?? 'post', revision),
          status: 'draft',
          revision,
          createdAt: previous?.createdAt ?? now,
          updatedAt: now,
          approvedAt: null,
        };
        return {
          items: previous ? contents.map((candidate) => (candidate.id === next.id ? next : candidate)) : [...contents, next],
          result: next,
        };
      });
      return { content, slot: await setSlotStatus(slotId, 'toApprove') };
    },

    async updateVariant(contentId, channel, text) {
      await delay(latency(200, 400));
      return updateContent(contentId, (content) => ({
        ...content,
        variants: content.variants.map((variant) => (variant.channel === channel ? { ...variant, text } : variant)),
      }));
    },

    async rewrite(contentId, channel, instruction) {
      await delay(latency(900, 1400));
      return updateContent(contentId, (content) => ({
        ...content,
        variants: content.variants.map((variant) =>
          variant.channel === channel
            ? { ...variant, text: rewriteText(variant.text, instruction, `${content.id}|${content.updatedAt}`) }
            : variant,
        ),
      }));
    },

    async get(contentId) {
      await delay(latency(120, 250));
      return (await contentsCollection.list()).find((content) => content.id === contentId) ?? null;
    },

    async listDrafts(brandId) {
      await delay(latency(150, 300));
      return (await contentsCollection.list())
        .filter((content) => content.brandId === brandId && content.slotId === null)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    async createDirect(brandId, { source, channels, format }) {
      const brand = await brandById(brandId);
      await delay(latency(2400, 3200));
      const id = createId('content');
      const now = new Date().toISOString();
      const content: Content = {
        id,
        brandId,
        slotId: null,
        ideaId: null,
        brief: source,
        channels,
        ...generateDirectContent(brand, source, channels, format, 0, id),
        status: 'draft',
        revision: 0,
        createdAt: now,
        updatedAt: now,
        approvedAt: null,
      };
      return contentsCollection.update((contents) => ({ items: [...contents, content], result: content }));
    },

    async regenerate(contentId, format) {
      const current = (await contentsCollection.list()).find((content) => content.id === contentId);
      if (!current?.brief) throw new Error('Da qui si rifanno solo i contenuti creati direttamente');
      const brief = current.brief;
      const brand = await brandById(current.brandId);
      await delay(latency(2400, 3200));
      const revision = current.revision + 1;
      const generated = generateDirectContent(brand, brief, current.channels, format ?? current.format, revision, current.id);
      return updateContent(contentId, (existing) => ({ ...existing, ...generated, revision, status: 'draft', approvedAt: null }));
    },

    async approve(contentId) {
      await delay(latency(400, 700));
      const current = (await contentsCollection.list()).find((content) => content.id === contentId);
      if (!current?.slotId) throw new Error('Il contenuto non è in un’uscita: va programmato');
      const slotId = current.slotId;
      const content = await updateContent(contentId, (existing) => ({
        ...existing,
        status: 'approved',
        approvedAt: new Date().toISOString(),
      }));
      return { content, slot: await setSlotStatus(slotId, 'scheduled') };
    },

    async schedule(contentId, { date, time, publishNow = false }) {
      const current = (await contentsCollection.list()).find((content) => content.id === contentId);
      if (!current) throw new Error('Contenuto non trovato');
      await delay(latency(400, 700));
      const status: PlanSlot['status'] = publishNow ? 'published' : 'scheduled';
      const slot = await slotsCollection.update((slots) => {
        const existing = current.slotId ? slots.find((candidate) => candidate.id === current.slotId) : undefined;
        const next: PlanSlot = existing
          ? { ...existing, date, time, status }
          : {
              id: createId('slot'),
              brandId: current.brandId,
              date,
              time,
              channels: current.channels,
              themeId: current.themeId,
              ideaId: null,
              contentTitle: current.title,
              status,
              origin: 'manual',
              createdAt: new Date().toISOString(),
            };
        return {
          items: existing ? slots.map((candidate) => (candidate.id === next.id ? next : candidate)) : [...slots, next],
          result: next,
        };
      });
      const content = await updateContent(contentId, (existing) => ({
        ...existing,
        slotId: slot.id,
        status: 'approved',
        approvedAt: new Date().toISOString(),
      }));
      return { content, slot };
    },

    async reopen(contentId) {
      await delay(latency(300, 500));
      const current = (await contentsCollection.list()).find((content) => content.id === contentId);
      if (!current?.slotId) throw new Error('Il contenuto non è in un’uscita');
      const slotId = current.slotId;
      const content = await updateContent(contentId, (existing) => ({ ...existing, status: 'draft', approvedAt: null }));
      return { content, slot: await setSlotStatus(slotId, 'toApprove') };
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
    contents: createMockContentService(),
    ai: createMockAiService(),
    channels: createMockChannelService(),
  };
}
