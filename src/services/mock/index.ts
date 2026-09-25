import type { Brand, ChannelId, Identity } from '@/domain/brand';
import { applyPatch } from '@/domain/brand';
import { channelName } from '@/domain/catalog';
import { channelsWaitingForVideo, channelsWithoutImage, cutKey, footageKind, readScene, videoSeconds, type Content, type VideoScene } from '@/domain/content';
import { sourceTitle, type Idea, type IdeaDraft, type IdeaSource, type IdeaStatus, type MaterialFile } from '@/domain/idea';
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
import {
  brandKit,
  channelsWaitingForVisual,
  creationSteps,
  editDesign,
  fallbackDesign,
  needsImages,
  photoCarouselDesign,
  redoDesign,
  refreshDesign,
  withoutPhoto,
  withUploadedPhoto,
  type VisualDesign,
  type VisualStep,
} from '@/domain/visual';
import { toDay, today } from '@/lib/dates';
import { delay, latency } from '@/lib/delay';
import { createId } from '@/lib/id';

import {
  createStepLog,
  IDEAS_STEPS,
  REWRITE_STEPS,
  WRITING_STEPS,
  BROLL_STEPS,
  MATERIAL_STEPS,
  stepsInSequence,
  MUSIC_STEPS,
  VIDEO_COVER_STEPS,
  VIDEO_CUT_STEPS,
  VIDEO_SCENE_STEPS,
  pageStep,
  searchStep,
  THINKING_STEP,
} from '../ai-steps';
import type {
  BrandService,
  ChannelService,
  ContentService,
  IdeaService,
  JobService,
  OnAiSteps,
  PlanService,
  Services,
} from '../types';
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
import { sampleCutout, samplePhoto } from './sample-images';

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
        const generated = generateContent(brand, idea, slot.channels, idea.formats[0] ?? 'post', 0);
        const { design } = generated.visual;
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
            ...generated,
            // Le uscite già approvate hanno il loro visivo: una card senza foto è pronta subito.
            visual: {
              ...generated.visual,
              design: approved && design && !needsImages(design) ? { ...design, status: 'ready' } : design,
            },
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

    // Nel mock l'immagine resta dov'è: sul telefono o nel browser di chi la carica.
    async uploadReference(uri) {
      await delay(300);
      return { path: null, url: uri };
    },

    /** Nel mock il file resta sul telefono: il materiale è il suo indirizzo locale. */
    async uploadMaterial(_brandId, file) {
      await delay(latency(250, 500));
      return { path: null, url: file.uri };
    },

    /** Il mock non compone: finge i passi e scrive quattro atmosfere, senza file da ascoltare. */
    async remakeMusic(brandId, onSteps) {
      const log = createStepLog(onSteps);
      log.start(THINKING_STEP, MUSIC_STEPS.plan);
      await delay(latency(900, 1300));
      log.drop(THINKING_STEP);
      const moods: [string, number][] = [
        ['calma del mattino', 84],
        ['al lavoro', 104],
        ['il risultato', 96],
        ['energia del sabato', 118],
      ];
      for (const [index, [mood, bpm]] of moods.entries()) {
        log.start(`track-${index}`, MUSIC_STEPS.track(mood), `${bpm} bpm`);
        await delay(latency(300, 500));
        log.finish(`track-${index}`);
      }
      const database = await readDatabase();
      const brand = database.brands.find((candidate) => candidate.id === brandId);
      if (!brand) throw new Error('Brand non trovato');
      const music = moods.map(([mood, bpm]) => ({ id: createId('track'), mood, bpm, seconds: 45, file: { path: null, url: '' } }));
      const updated = { ...brand, visual: { ...brand.visual, music }, updatedAt: new Date().toISOString() };
      await writeDatabase({ ...database, brands: database.brands.map((candidate) => (candidate.id === brandId ? updated : candidate)) });
      return updated;
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

    async generate(brandId, count = 8, onSteps) {
      const brand = await brandById(brandId);
      // Gli stessi passi della generazione vera, con due ricerche finte sui temi.
      const log = createStepLog(onSteps);
      log.start('context', IDEAS_STEPS.context(brand.identity.name), `${brand.themes.length} temi`);
      await delay(latency(300, 500));
      log.finish('context');
      log.start(THINKING_STEP, IDEAS_STEPS.plan);
      await delay(latency(500, 800));
      for (const theme of brand.themes.slice(0, 2)) {
        log.drop(THINKING_STEP);
        const { label } = searchStep(`${theme.name} novità`);
        log.start(theme.id, label);
        await delay(latency(500, 800));
        log.finish(theme.id);
        log.start(THINKING_STEP, IDEAS_STEPS.reflect);
        await delay(latency(400, 600));
      }
      log.drop(THINKING_STEP);
      log.start('write', IDEAS_STEPS.write(count));
      await delay(latency(300, 500));
      log.finish('write');
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

    async addIdea(brandId, ideaId, channels) {
      const brand = await brandById(brandId);
      await delay(latency(400, 700));
      const found = (await ideasCollection.list()).find((candidate) => candidate.id === ideaId);
      if (!found) throw new Error('Idea non trovata');
      // I canali scelti da chi guarda l'idea vincono su quelli che l'idea si porta dietro.
      const idea = channels && channels.length > 0 ? { ...found, channels: [...channels] } : found;
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

/** Il mock non guarda niente: un passo per file, per vedere la schermata lavorare. */
async function lookAtMaterial(files: readonly MaterialFile[], onSteps: OnAiSteps): Promise<void> {
  const log = createStepLog(onSteps);
  for (const [index, file] of files.entries()) {
    log.start(`file-${index}`, MATERIAL_STEPS.look(file.name, file.kind), MATERIAL_STEPS.position(index, files.length));
    await delay(latency(350, 600));
    log.finish(`file-${index}`);
  }
}

/**
 * Nel mock la bozza dal materiale usa i file in ordine: i video diventano girati (i primi 4 secondi), le foto foto vive
 * o slide del carosello con la loro foto.
 */
function withMaterial<T extends { visual: Content['visual']; format: Content['format'] }>(written: T, source: IdeaSource, brand: Brand): T {
  if (source.kind !== 'material') return written;
  const files = source.files;
  if (written.format === 'video') {
    const scenes = written.visual.scenes.map((scene, index): VideoScene => {
      const file = files[index];
      if (!file) return readScene(scene);
      return file.kind === 'video'
        ? { ...readScene(scene), source: 'shoot', footage: { path: file.path, url: file.url }, trim: { start: 0, end: Math.min(4, scene.seconds) } }
        : { ...readScene(scene), source: 'photo', footage: { path: file.path, url: file.url }, trim: null };
    });
    return { ...written, visual: { ...written.visual, scenes } };
  }
  if (written.format === 'carousel') {
    const photos = files.filter((file) => file.kind === 'image');
    const slides = written.visual.slides.map((slide, index) => {
      const photo = photos[index];
      return photo ? { ...slide, photo: { path: photo.path, url: photo.url } } : slide;
    });
    return { ...written, visual: { ...written.visual, slides, design: photoCarouselDesign(slides, brand.visual.line) } };
  }
  return written;
}

function updateScene(contentId: string, index: number, change: (scene: VideoScene) => VideoScene): Promise<Content> {
  return updateContent(contentId, (content) => ({
    ...content,
    visual: {
      ...content.visual,
      scenes: content.visual.scenes.map((scene, position) => (position === index ? change(readScene(scene)) : scene)),
    },
  }));
}

function updateContent(contentId: string, change: (content: Content) => Content): Promise<Content> {
  return contentsCollection.update((contents) => {
    const current = contents.find((content) => content.id === contentId);
    if (!current) throw new Error('Contenuto non trovato');
    const next: Content = { ...change(current), updatedAt: new Date().toISOString() };
    return { items: contents.map((content) => (content.id === contentId ? next : content)), result: next };
  });
}

/** La bozza rifatta porta la sua proposta di visivo; un visivo già creato resta e aspetta «Aggiorna il visivo». */
function withRedoneDesign<T extends { visual: Content['visual'] }>(previous: Content | null | undefined, generated: T): T {
  return { ...generated, visual: { ...generated.visual, design: redoDesign(previous?.visual.design, generated.visual.design) } };
}

function requireDesign(content: Content): VisualDesign {
  if (!content.visual.design) throw new Error('Il contenuto non ha un visivo');
  return content.visual.design;
}

function updateDesign(contentId: string, change: (design: VisualDesign, content: Content) => VisualDesign): Promise<Content> {
  return updateContent(contentId, (content) => ({
    ...content,
    visual: { ...content.visual, design: change(requireDesign(content), content) },
  }));
}

/** Nel mock ogni passo della creazione dura un po', come col modello vero. */
const STEP_MS: Record<VisualStep, number> = { image: 2600, cutout: 1500, render: 900 };
const running = new Set<string>();

async function startCreation(contentId: string): Promise<Content> {
  const content = await updateDesign(contentId, (design) =>
    design.status === 'creating' ? design : { ...design, status: 'creating', step: creationSteps(design)[0], error: null },
  );
  void runCreation(contentId);
  return content;
}

/** La creazione avanza a passi dentro il contenuto; l'app lo rilegge e vede a che punto è. */
async function runCreation(contentId: string): Promise<void> {
  if (running.has(contentId)) return;
  running.add(contentId);
  try {
    for (;;) {
      const content = (await contentsCollection.list()).find((candidate) => candidate.id === contentId);
      const step = content?.visual.design?.status === 'creating' ? content.visual.design.step : null;
      if (!content || !step) return;
      await delay(STEP_MS[step]);
      const kit = brandKit(await brandById(content.brandId));
      await updateDesign(contentId, (design) => {
        if (design.status !== 'creating' || design.step !== step) return design;
        let next = design;
        if (step === 'image') next = { ...design, image: { ...design.image, photo: { path: null, url: samplePhoto(kit, `${contentId}|${Date.now()}`) } } };
        if (step === 'cutout') next = { ...design, image: { ...design.image, cutout: { path: null, url: sampleCutout() } } };
        if (step === 'render') return { ...next, status: 'ready', step: null };
        return { ...next, step: creationSteps(next)[0] };
      });
    }
  } finally {
    running.delete(contentId);
  }
}

/** Una creazione interrotta da un ricaricamento riparte alla prima lettura. */
function resumeCreation(content: Content | undefined): Content | null {
  if (content?.visual.design?.status === 'creating') void runCreation(content.id);
  return content ?? null;
}

function assertVisualReady(content: Content) {
  const waiting = channelsWaitingForVisual(
    content.format,
    content.channels,
    content.visual.design,
    channelsWithoutImage(content),
  );
  if (waiting.length > 0) throw new Error('Crea prima il visivo: senza immagine questi canali non pubblicano');
}

/**
 * I passi della scrittura di una bozza, simulati con gli stessi tempi e le stesse parole di quelli veri:
 * profilo, fonte, eventuale lettura del link, un testo per canale, il visivo.
 */
async function writingSteps(
  onSteps: OnAiSteps | undefined,
  { brand, basis, channels, link }: { brand: Brand; basis: string; channels: readonly ChannelId[]; link?: string },
): Promise<void> {
  const log = createStepLog(onSteps);
  log.start('context', WRITING_STEPS.context(brand.identity.name), `${brand.themes.length} temi`);
  await delay(latency(300, 500));
  log.finish('context');
  if (basis) {
    log.start('basis', WRITING_STEPS.basis(basis));
    await delay(latency(250, 450));
    log.finish('basis');
  }
  log.start(THINKING_STEP, WRITING_STEPS.plan);
  await delay(latency(500, 800));
  if (link) {
    log.drop(THINKING_STEP);
    const { label, detail } = pageStep(link);
    log.start('page', label, detail);
    await delay(latency(600, 900));
    log.finish('page');
    log.start(THINKING_STEP, WRITING_STEPS.reflect);
    await delay(latency(400, 600));
  }
  log.drop(THINKING_STEP);
  log.start('write', WRITING_STEPS.write(channels.map(channelName).join(' e ')));
  await delay(latency(700, 1100));
  log.finish('write');
  log.start('visual', WRITING_STEPS.visual);
  await delay(latency(300, 500));
  log.finish('visual');
}

/** I passi di un ritocco chiesto dall'utente. */
async function rewritingSteps(onSteps: OnAiSteps | undefined, channel: ChannelId, instruction: string): Promise<void> {
  const log = createStepLog(onSteps);
  log.start('read', REWRITE_STEPS.read(channelName(channel)));
  await delay(latency(250, 400));
  log.finish('read');
  log.start('ask', REWRITE_STEPS.ask(instruction));
  await delay(latency(200, 350));
  log.finish('ask');
  log.start('write', REWRITE_STEPS.write);
  await delay(latency(500, 800));
  log.finish('write');
}

/** Il link da cui nasce il contenuto, se la fonte è un indirizzo. */
const linkOf = (source: { kind: string; url?: string } | null | undefined) =>
  source?.kind === 'link' ? source.url : undefined;

function createMockContentService(): ContentService {
  return {
    async list(brandId) {
      await delay(latency(150, 300));
      return (await contentsCollection.list()).filter((content) => content.brandId === brandId);
    },

    async getForSlot(slotId) {
      await delay(latency(150, 300));
      return resumeCreation((await contentsCollection.list()).find((content) => content.slotId === slotId));
    },

    async editVisual(contentId, edit) {
      await delay(latency(120, 250));
      return updateDesign(contentId, (design) => editDesign(design, edit));
    },

    async proposeVisual(contentId) {
      await delay(latency(200, 400));
      return updateContent(contentId, (content) => ({
        ...content,
        visual: {
          ...content.visual,
          design: content.visual.design ?? fallbackDesign(content.format, content.visual.headline || content.title, content.visual.slides),
        },
      }));
    },

    /**
     * Nel mock nessuno disegna: si simulano i passi e si torna la proposta fatta dai testi, come
     * `proposeVisual`. Serve a provare la schermata, non il disegno.
     */
    async designVisual(contentId, _channels, _instruction, onSteps) {
      const log = createStepLog(onSteps);
      for (const [id, label] of [
        ['look', 'Guardo le card che hai approvato'],
        ['think', 'Penso a come dirlo in una card'],
        ['draw', 'Scrivo il layout'],
        ['check', 'Compongo la card e me la guardo'],
      ] as const) {
        log.start(id, label);
        await delay(latency(500, 900));
        log.finish(id);
      }
      return updateContent(contentId, (content) => ({
        ...content,
        visual: {
          ...content.visual,
          design: content.visual.design ?? fallbackDesign(content.format, content.visual.headline || content.title, content.visual.slides),
        },
      }));
    },

    /** Nel mock il file resta dov'è sul telefono: il materiale è il suo indirizzo locale. */
    async uploadFootage(contentId, index, file) {
      await delay(latency(500, 900));
      return updateScene(contentId, index, (scene) => ({ ...scene, footage: { path: null, url: file.uri } }));
    },

    async removeFootage(contentId, index) {
      await delay(latency(150, 300));
      return updateScene(contentId, index, (scene) => ({ ...scene, footage: null }));
    },

    /** Il mock non ripensa niente: la scena diventa una foto viva del lavoro finito. */
    async replaceScene(contentId, index, onSteps) {
      const log = createStepLog(onSteps);
      log.start(THINKING_STEP, VIDEO_SCENE_STEPS.thinking);
      await delay(latency(900, 1400));
      log.drop(THINKING_STEP);
      log.start('done', VIDEO_SCENE_STEPS.done('foto viva'));
      log.finish('done');
      return updateScene(contentId, index, (scene) => ({
        ...scene,
        description: 'Una foto di un lavoro finito, con uno zoom lento verso il dettaglio.',
        source: 'photo',
        footage: null,
      }));
    },

    /** Nel mock il fotogramma è una luce finta nei colori del brand; la clip non c'è, come il montaggio. */
    async makeFrame(contentId, index, onSteps) {
      const log = createStepLog(onSteps);
      log.start(THINKING_STEP, BROLL_STEPS.frame);
      await delay(latency(900, 1400));
      log.drop(THINKING_STEP);
      log.start('done', BROLL_STEPS.frameDone);
      log.finish('done');
      const owner = (await contentsCollection.list()).find((content) => content.id === contentId);
      const brand = await brandById(owner?.brandId ?? '');
      return updateScene(contentId, index, (scene) => ({
        ...scene,
        frame: { path: null, url: samplePhoto(brandKit(brand), `${scene.description}|${Date.now()}`) },
        clip: null,
      }));
    },

    async makeClip(contentId, index, onSteps) {
      const log = createStepLog(onSteps);
      log.start(THINKING_STEP, BROLL_STEPS.clip);
      await delay(latency(1500, 2200));
      log.drop(THINKING_STEP);
      log.start('done', BROLL_STEPS.clipDone);
      log.finish('done');
      return updateScene(contentId, index, (scene) => ({ ...scene, clip: { path: null, url: '' } }));
    },

    async lockScene(contentId, index, locked) {
      await delay(latency(150, 300));
      return updateScene(contentId, index, (scene) => ({ ...scene, locked }));
    },

    async setMusic(contentId, musicId) {
      await delay(latency(150, 300));
      return updateContent(contentId, (content) => {
        const { musicId: _previous, ...visual } = content.visual;
        return { ...content, visual: musicId === 'auto' ? visual : { ...visual, musicId } };
      });
    },

    /** Il mock non ha copertine vere: una luce nei colori del brand, col titolo. */
    async makeCover(contentId, onSteps) {
      const log = createStepLog(onSteps);
      log.start(THINKING_STEP, VIDEO_COVER_STEPS.thinking);
      await delay(latency(900, 1300));
      log.drop(THINKING_STEP);
      log.start('done', VIDEO_COVER_STEPS.done);
      log.finish('done');
      const owner = (await contentsCollection.list()).find((content) => content.id === contentId);
      const brand = await brandById(owner?.brandId ?? '');
      return updateContent(contentId, (content) => ({
        ...content,
        visual: {
          ...content.visual,
          cover: {
            file: { path: null, url: samplePhoto(brandKit(brand), `copertina|${Date.now()}`) },
            photo: null,
            cutout: null,
            template: 'photo-only',
            title: content.visual.headline || content.title,
            kicker: '',
            madeAt: new Date().toISOString(),
          },
        },
      }));
    },

    async retitleCover(contentId, title, kicker) {
      await delay(latency(200, 400));
      return updateContent(contentId, (content) =>
        content.visual.cover ? { ...content, visual: { ...content.visual, cover: { ...content.visual.cover, title, kicker } } } : content,
      );
    },

    /** Il mock non monta: finge i passi e segna le scene che aspettano il materiale. Il video non c'è. */
    async cutVideo(contentId, onSteps) {
      const log = createStepLog(onSteps);
      for (const [id, label] of [
        ['read', VIDEO_CUT_STEPS.thinking],
        ['graphics', 'Scrivo la grafica e i testi a schermo'],
        ['render', 'Rendo il montaggio'],
        ['look', 'Guardo il montaggio'],
      ] as const) {
        log.start(id, label);
        await delay(latency(600, 1000));
        log.finish(id);
      }
      return updateContent(contentId, (content) => {
        const scenes = content.visual.scenes.map(readScene);
        const placeholders = scenes.filter((scene) => (scene.source === 'broll' ? !scene.clip : footageKind(scene.source) && !scene.footage)).length;
        log.start('done', VIDEO_CUT_STEPS.done(placeholders));
        log.finish('done');
        return {
          ...content,
          visual: {
            ...content.visual,
            cut: {
              file: { path: null, url: '' },
              placeholders,
              seconds: videoSeconds(scenes),
              from: cutKey(content.visual),
              madeAt: new Date().toISOString(),
            },
          },
        };
      });
    },

    async createVisual(contentId) {
      await delay(latency(200, 400));
      return startCreation(contentId);
    },

    async regenerateImage(contentId) {
      await delay(latency(200, 400));
      await updateDesign(contentId, (design) => withoutPhoto(design));
      return startCreation(contentId);
    },

    async uploadPhoto(contentId, dataUri) {
      await delay(latency(400, 700));
      return updateDesign(contentId, (design) => withUploadedPhoto(design, { path: null, url: dataUri }));
    },

    async refreshVisual(contentId) {
      await delay(latency(200, 400));
      return updateDesign(contentId, (design) => refreshDesign(design));
    },

    async prepare(slotId, format, onSteps) {
      const slot = (await slotsCollection.list()).find((candidate) => candidate.id === slotId);
      if (!slot?.ideaId) throw new Error('L’uscita non ha un’idea');
      const idea = (await ideasCollection.list()).find((candidate) => candidate.id === slot.ideaId);
      if (!idea) throw new Error('Idea non trovata');
      const brand = await brandById(slot.brandId);
      await writingSteps(onSteps, { brand, basis: idea.title, channels: slot.channels, link: linkOf(idea.source) });

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
          ...withRedoneDesign(
            previous,
            generateContent(brand, idea, slot.channels, format ?? previous?.format ?? idea.formats[0] ?? 'post', revision),
          ),
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

    async setVariantLayout(contentId, channel, layout) {
      await delay(latency(150, 300));
      return updateContent(contentId, (content) => ({
        ...content,
        variants: content.variants.map((variant) => (variant.channel === channel ? { ...variant, ...layout } : variant)),
      }));
    },

    async rewrite(contentId, channel, instruction, onSteps) {
      await rewritingSteps(onSteps, channel, instruction);
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
      return resumeCreation((await contentsCollection.list()).find((content) => content.id === contentId));
    },

    async listDrafts(brandId) {
      await delay(latency(150, 300));
      return (await contentsCollection.list())
        .filter((content) => content.brandId === brandId && content.slotId === null)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    async createDirect(brandId, { source, channels, format }, onSteps) {
      const brand = await brandById(brandId);
      const looking = stepsInSequence(onSteps);
      if (source.kind === 'material') await lookAtMaterial(source.files, looking.first);
      await writingSteps(looking.then, {
        brand,
        basis: sourceTitle(source),
        channels,
        link: linkOf(source),
      });
      const id = createId('content');
      const now = new Date().toISOString();
      const content: Content = {
        id,
        brandId,
        slotId: null,
        ideaId: null,
        brief: source,
        channels,
        ...withMaterial(generateDirectContent(brand, source, channels, format, 0, id), source, brand),
        status: 'draft',
        revision: 0,
        createdAt: now,
        updatedAt: now,
        approvedAt: null,
      };
      return contentsCollection.update((contents) => ({ items: [...contents, content], result: content }));
    },

    async createFromIdea(brandId, ideaId, wanted, onSteps) {
      const brand = await brandById(brandId);
      const idea = (await ideasCollection.list()).find((candidate) => candidate.id === ideaId);
      if (!idea) throw new Error('Idea non trovata');
      const allowed = selectedChannels(brand);
      // I canali scelti da chi guarda l'idea vincono; senza scelta valgono quelli dell'idea.
      const asked = wanted && wanted.length > 0 ? [...wanted] : idea.channels;
      const fitting = asked.filter((channel) => allowed.includes(channel));
      const channels: ChannelId[] = fitting.length > 0 ? fitting : allowed.length > 0 ? allowed : ['linkedin'];
      await writingSteps(onSteps, { brand, basis: idea.title, channels, link: linkOf(idea.source) });
      const now = new Date().toISOString();
      const content: Content = {
        id: createId('content'),
        brandId,
        slotId: null,
        ideaId: idea.id,
        brief: null,
        title: idea.title,
        themeId: idea.themeId,
        channels,
        ...generateContent(brand, idea, channels, idea.formats[0] ?? 'post', 0),
        status: 'draft',
        revision: 0,
        createdAt: now,
        updatedAt: now,
        approvedAt: null,
      };
      return contentsCollection.update((contents) => ({ items: [...contents, content], result: content }));
    },

    async regenerate(contentId, format, onSteps) {
      const current = (await contentsCollection.list()).find((content) => content.id === contentId);
      if (!current) throw new Error('Contenuto non trovato');
      const idea = current.ideaId
        ? (await ideasCollection.list()).find((candidate) => candidate.id === current.ideaId)
        : undefined;
      const brand = await brandById(current.brandId);
      const nextFormat = format ?? current.format;
      const revision = current.revision + 1;
      let generated;
      if (idea) {
        await writingSteps(onSteps, { brand, basis: idea.title, channels: current.channels, link: linkOf(idea.source) });
        generated = generateContent(brand, idea, current.channels, nextFormat, revision);
      } else if (current.brief) {
        await writingSteps(onSteps, {
          brand,
          basis: current.title,
          channels: current.channels,
          link: linkOf(current.brief),
        });
        generated = generateDirectContent(brand, current.brief, current.channels, nextFormat, revision, current.id);
      } else {
        throw new Error('Non so da cosa rifare la bozza');
      }
      return updateContent(contentId, (existing) => ({
        ...existing,
        ...withRedoneDesign(existing, generated),
        revision,
        status: 'draft',
        approvedAt: null,
      }));
    },

    async approve(contentId) {
      await delay(latency(400, 700));
      const current = (await contentsCollection.list()).find((content) => content.id === contentId);
      if (!current?.slotId) throw new Error('Il contenuto non è in un’uscita: va programmato');
      assertVisualReady(current);
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
      assertVisualReady(current);
      if (publishNow && channelsWaitingForVideo(current).length > 0) throw new Error('Il video non è pronto: monta il video coi girati, senza cartelli.');
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
              // Una bozza scritta da un'idea porta l'idea nell'uscita, così l'idea risulta nel piano.
              ideaId: current.ideaId,
              contentTitle: current.title,
              status,
              origin: current.ideaId ? 'idea' : 'manual',
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

export function createMockChannelService(): ChannelService {
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

/**
 * Nel mock le generazioni sono finte e vivono dentro la schermata: non c'è nessuna coda sul
 * server, quindi non c'è mai un lavoro da ritrovare. Le schermate chiedono lo stesso, e qui
 * la risposta è sempre «nessuno».
 */
function createMockJobService(): JobService {
  return {
    open: () => Promise.resolve(null),
    follow: () => Promise.reject(new Error('senza backend non ci sono lavori da seguire')),
    cancel: () => Promise.resolve(),
  };
}

export function createMockServices(): Services {
  return {
    brands: createMockBrandService(),
    ideas: createMockIdeaService(),
    plan: createMockPlanService(),
    contents: createMockContentService(),
    ai: createMockAiService(),
    jobs: createMockJobService(),
    channels: createMockChannelService(),
  };
}
