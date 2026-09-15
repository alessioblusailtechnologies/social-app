import type { ChannelId } from '@/domain/brand';
import type { Content, RewriteInstruction } from '@/domain/content';
import type { IdeaFormat } from '@/domain/idea';
import { selectedChannels, type PlanSlot } from '@/domain/plan';
import type { DirectContentRequest } from '@/services/types';

import { rewriteVariant, writeContent } from '../ai/content';
import { ApiError } from '../contract/errors';
import { requireBrand } from '../data/brands';
import {
  findContentForSlot,
  insertContent,
  listContents,
  listDraftContents,
  requireContent,
  saveContent,
  type ContentFields,
} from '../data/contents';
import { findIdea, requireIdea } from '../data/ideas';
import { findSlot, insertSlot, requireSlot, saveSlot } from '../data/slots';
import type { Identity } from '../db/identity';
import { aiMeta, inTransaction, type Deps } from './deps';

/**
 * I contenuti. Ogni operazione con l'AI legge in una transazione, genera fuori e scrive in
 * un'altra, ricontrollando che nel frattempo non sia cambiato quello su cui ha scritto.
 */

export type WithSlot = { content: Content; slot: PlanSlot };

const AI_FAILED = () => new ApiError(502, 'AI_FAILED', 'Non sono riuscito a completare la generazione. Riprova.');

export function listBrandContents(deps: Deps, identity: Identity, brandId: string): Promise<Content[]> {
  return inTransaction(deps, identity, async (db) => {
    await requireBrand(db, brandId);
    return listContents(db, brandId);
  });
}

/** Contenuti creati direttamente e non ancora programmati. */
export function listBrandDrafts(deps: Deps, identity: Identity, brandId: string): Promise<Content[]> {
  return inTransaction(deps, identity, async (db) => {
    await requireBrand(db, brandId);
    return listDraftContents(db, brandId);
  });
}

export function getContent(deps: Deps, identity: Identity, contentId: string): Promise<Content> {
  return inTransaction(deps, identity, (db) => requireContent(db, contentId));
}

export function getSlotContent(deps: Deps, identity: Identity, slotId: string): Promise<{ content: Content | null }> {
  return inTransaction(deps, identity, async (db) => {
    await requireSlot(db, slotId, deps.now());
    return { content: await findContentForSlot(db, slotId) };
  });
}

/** Prepara (o rifà) la bozza dall'idea dell'uscita, che passa a "Da approvare". */
export async function prepareContent(deps: Deps, identity: Identity, slotId: string, format?: IdeaFormat): Promise<WithSlot> {
  const { slot, idea, brand, previous } = await inTransaction(deps, identity, async (db) => {
    const slot = await requireSlot(db, slotId, deps.now());
    if (!slot.ideaId) throw ApiError.invalid('L’uscita non ha un’idea: sceglila prima di preparare la bozza.');
    return {
      slot,
      idea: await requireIdea(db, slot.ideaId),
      brand: await requireBrand(db, slot.brandId),
      previous: await findContentForSlot(db, slotId),
    };
  });

  const revision = previous ? previous.revision + 1 : 0;
  const written = await writeContent(deps.ai, aiMeta(identity, brand.id), {
    brand,
    basis: { kind: 'idea', idea },
    channels: slot.channels,
    format: format ?? previous?.format ?? idea.formats[0] ?? 'post',
    revision,
    previous,
    now: deps.now(),
  });

  return inTransaction(deps, identity, async (db) => {
    const current = await requireSlot(db, slotId, deps.now());
    if (current.ideaId !== idea.id) {
      throw ApiError.conflict('SLOT_CHANGED', 'L’uscita è cambiata mentre preparavo la bozza: riprova.');
    }
    const fields: ContentFields = {
      slotId,
      ideaId: idea.id,
      brief: null,
      title: idea.title,
      themeId: idea.themeId,
      channels: slot.channels,
      format: written.format,
      variants: written.variants,
      visual: written.visual,
      status: 'draft',
      revision,
      approvedAt: null,
    };
    const existing = await findContentForSlot(db, slotId);
    const content = existing
      ? await saveContent(db, { ...existing, ...fields })
      : await insertContent(db, identity.accountId, brand.id, fields);
    return { content, slot: await saveSlot(db, { ...current, status: 'toApprove' }, deps.now()) };
  });
}

/** Nuovo contenuto senza idea né uscita: la bozza nasce dalla fonte. */
export async function createDirectContent(
  deps: Deps,
  identity: Identity,
  brandId: string,
  { source, channels, format }: DirectContentRequest,
): Promise<Content> {
  const brand = await inTransaction(deps, identity, (db) => requireBrand(db, brandId));
  const written = await writeContent(deps.ai, aiMeta(identity, brandId), {
    brand,
    basis: { kind: 'source', source },
    channels,
    format,
    revision: 0,
    previous: null,
    now: deps.now(),
  });
  return inTransaction(deps, identity, (db) =>
    insertContent(db, identity.accountId, brandId, {
      slotId: null,
      ideaId: null,
      brief: source,
      title: written.title,
      themeId: written.themeId,
      channels,
      format,
      variants: written.variants,
      visual: written.visual,
      status: 'draft',
      revision: 0,
      approvedAt: null,
    }),
  );
}

/** Bozza scritta subito da un'idea, senza passare dal piano: entra nel piano quando viene programmata. */
export async function createContentFromIdea(deps: Deps, identity: Identity, brandId: string, ideaId: string): Promise<Content> {
  const { brand, idea } = await inTransaction(deps, identity, async (db) => {
    const brand = await requireBrand(db, brandId);
    const idea = await requireIdea(db, ideaId);
    if (idea.brandId !== brandId) throw ApiError.notFound('Idea non trovata.');
    return { brand, idea };
  });
  const allowed = selectedChannels(brand);
  const fitting = idea.channels.filter((channel) => allowed.includes(channel));
  const channels: ChannelId[] = fitting.length > 0 ? fitting : allowed.length > 0 ? allowed : ['linkedin'];
  const written = await writeContent(deps.ai, aiMeta(identity, brandId), {
    brand,
    basis: { kind: 'idea', idea },
    channels,
    format: idea.formats[0] ?? 'post',
    revision: 0,
    previous: null,
    now: deps.now(),
  });
  return inTransaction(deps, identity, (db) =>
    insertContent(db, identity.accountId, brandId, {
      slotId: null,
      ideaId: idea.id,
      brief: null,
      title: idea.title,
      themeId: idea.themeId,
      channels,
      format: written.format,
      variants: written.variants,
      visual: written.visual,
      status: 'draft',
      revision: 0,
      approvedAt: null,
    }),
  );
}

/** Rifà la bozza con un altro taglio o formato: dall'idea se c'è, altrimenti dalla richiesta dell'utente. */
export async function regenerateContent(deps: Deps, identity: Identity, contentId: string, format?: IdeaFormat): Promise<Content> {
  const { content, idea, brand } = await inTransaction(deps, identity, async (db) => {
    const content = await requireContent(db, contentId);
    return {
      content,
      idea: content.ideaId ? await findIdea(db, content.ideaId) : null,
      brand: await requireBrand(db, content.brandId),
    };
  });
  if (!idea && !content.brief) throw ApiError.invalid('Non so da cosa rifare la bozza.');

  const revision = content.revision + 1;
  const written = await writeContent(deps.ai, aiMeta(identity, brand.id), {
    brand,
    basis: idea ? { kind: 'idea', idea } : { kind: 'source', source: content.brief! },
    channels: content.channels,
    format: format ?? content.format,
    revision,
    previous: content,
    now: deps.now(),
  });

  return inTransaction(deps, identity, async (db) => {
    const current = await requireContent(db, contentId);
    return saveContent(db, {
      ...current,
      ...(idea ? {} : { title: written.title, themeId: written.themeId }),
      format: written.format,
      variants: written.variants,
      visual: written.visual,
      revision,
      status: 'draft',
      approvedAt: null,
    });
  });
}

export function updateVariantText(
  deps: Deps,
  identity: Identity,
  contentId: string,
  channel: ChannelId,
  text: string,
): Promise<Content> {
  return inTransaction(deps, identity, async (db) => {
    const content = await requireContent(db, contentId);
    if (!content.variants.some((variant) => variant.channel === channel)) {
      throw ApiError.notFound('Il contenuto non esce su questo canale.');
    }
    return saveContent(db, {
      ...content,
      variants: content.variants.map((variant) => (variant.channel === channel ? { ...variant, text } : variant)),
    });
  });
}

export async function rewriteContentVariant(
  deps: Deps,
  identity: Identity,
  contentId: string,
  channel: ChannelId,
  instruction: RewriteInstruction,
): Promise<Content> {
  const { content, brand } = await inTransaction(deps, identity, async (db) => {
    const content = await requireContent(db, contentId);
    return { content, brand: await requireBrand(db, content.brandId) };
  });
  const text = await rewriteVariant(deps.ai, aiMeta(identity, brand.id), { brand, content, channel, instruction, now: deps.now() });
  if (!text) throw AI_FAILED();
  return updateVariantText(deps, identity, contentId, channel, text);
}

/** Approva un contenuto che è già in un'uscita: l'uscita passa a "Programmata". */
export function approveContent(deps: Deps, identity: Identity, contentId: string): Promise<WithSlot> {
  return inTransaction(deps, identity, async (db) => {
    const now = deps.now();
    const current = await requireContent(db, contentId);
    if (!current.slotId) throw ApiError.invalid('Il contenuto non è in un’uscita: va programmato.');
    const slot = await requireSlot(db, current.slotId, now);
    const content = await saveContent(db, { ...current, status: 'approved', approvedAt: now.toISOString() });
    return { content, slot: await saveSlot(db, { ...slot, status: 'scheduled' }, now) };
  });
}

/** Approva un contenuto creato direttamente e lo mette nel piano; con `publishNow` esce subito. */
export function scheduleContent(
  deps: Deps,
  identity: Identity,
  contentId: string,
  when: { date: string; time: string; publishNow?: boolean | undefined },
): Promise<WithSlot> {
  return inTransaction(deps, identity, async (db) => {
    const now = deps.now();
    const current = await requireContent(db, contentId);
    const status: PlanSlot['status'] = when.publishNow ? 'published' : 'scheduled';
    const existing = current.slotId ? await findSlot(db, current.slotId, now) : null;
    const slot = existing
      ? await saveSlot(db, { ...existing, date: when.date, time: when.time, status }, now)
      : await insertSlot(
          db,
          identity.accountId,
          current.brandId,
          {
            date: when.date,
            time: when.time,
            channels: current.channels,
            themeId: current.themeId,
            // Una bozza scritta da un'idea porta l'idea nell'uscita, così l'idea risulta nel piano.
            ideaId: current.ideaId,
            contentTitle: current.title,
            status,
            origin: current.ideaId ? 'idea' : 'manual',
          },
          now,
        );
    const content = await saveContent(db, { ...current, slotId: slot.id, status: 'approved', approvedAt: now.toISOString() });
    return { content, slot };
  });
}

/** Torna in bozza: l'uscita passa di nuovo a "Da approvare". */
export function reopenContent(deps: Deps, identity: Identity, contentId: string): Promise<WithSlot> {
  return inTransaction(deps, identity, async (db) => {
    const now = deps.now();
    const current = await requireContent(db, contentId);
    if (!current.slotId) throw ApiError.invalid('Il contenuto non è in un’uscita.');
    const slot = await requireSlot(db, current.slotId, now);
    const content = await saveContent(db, { ...current, status: 'draft', approvedAt: null });
    return { content, slot: await saveSlot(db, { ...slot, status: 'toApprove' }, now) };
  });
}
