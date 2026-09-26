import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';

import type { Brand } from '@shared/domain/brand';
import type { Content } from '@shared/domain/content';
import type { OnAiSteps } from '@shared/services/types';

import { readWebsite, suggestPositioning } from '../ai/profile';
import {
  channelIdSchema,
  directContentSchema,
  formatOptionSchema,
  generateIdeasSchema,
  ideaRefSchema,
  positioningRequestSchema,
  rewriteSchema,
  visualDesignSchema,
  visualStyleRequestSchema,
  websiteRequestSchema,
} from '../contract/schemas';
import type { Identity } from '../db/identity';
import {
  createContentFromIdea,
  createDirectContent,
  prepareContent,
  regenerateContent,
  rewriteContentVariant,
  type WithSlot,
} from '../services/contents';
import { aiMeta, type Deps } from '../services/deps';
import { generateBrandIdeas } from '../services/ideas';
import { designContentVisual } from '../services/visual';
import { cutContentVideo, makeContentCover } from '../services/video-cut';
import { remakeBrandMusic } from '../services/music';
import { makeBrollClip, makeBrollFrame } from '../services/video-broll';
import { replaceShootScene } from '../services/video-footage';
import { proposeVideoProfile } from '../services/video-profile';
import { proposeVisualStyle } from '../services/visual-style';
import { signBrand, signContent } from '../visual/files';

/**
 * Le generazioni che si possono mettere in coda. Il tipo di lavoro è scritto nella riga, non
 * è una funzione tenuta in memoria: dopo un riavvio il runner rilegge `kind` e `input` e sa
 * ancora cosa fare.
 *
 * Il risultato si salva com'è, senza indirizzi firmati: quelli scadono, e un lavoro può
 * restare lì finché l'utente non torna. Si firmano quando l'app lo legge (`sign`).
 */

export interface JobContext {
  deps: Deps;
  identity: Identity;
  log: FastifyBaseLogger;
  onSteps: OnAiSteps;
}

export interface JobKind {
  /** Valida il corpo salvato e restituisce il lavoro da eseguire. */
  prepare(input: unknown): (context: JobContext) => Promise<unknown>;
  /** Gli indirizzi dei file, firmati al momento della lettura. */
  sign?(deps: Deps, result: unknown): Promise<unknown>;
}

function kind<I>(schema: z.ZodType<I>, run: (context: JobContext, input: I) => Promise<unknown>, sign?: JobKind['sign']): JobKind {
  return {
    prepare(input) {
      const parsed = schema.parse(input);
      return (context) => run(context, parsed);
    },
    ...(sign ? { sign } : {}),
  };
}

/** Un risultato che è un contenuto, riletto dal database: le forme le ha già validate chi l'ha scritto. */
const signOne: JobKind['sign'] = (deps, result) => signContent(deps.media.storage, result as Content);

const signWithSlot: JobKind['sign'] = async (deps, result) => {
  const { content, slot } = result as WithSlot;
  return { content: await signContent(deps.media.storage, content), slot };
};

const brandRef = z.object({ brandId: z.uuid() });
const contentRef = z.object({ contentId: z.uuid() });
const sceneRef = contentRef.extend({ index: z.number().int().min(0).max(20) });

export const JOB_KINDS: Record<string, JobKind> = {
  // Onboarding: il brand non esiste ancora, il risultato resta nel lavoro finché l'app torna a prenderlo.
  website: kind(websiteRequestSchema, ({ deps, identity, onSteps }, { site, identity: profile }) =>
    readWebsite(deps.ai, aiMeta(identity), site, profile, onSteps),
  ),

  positioning: kind(positioningRequestSchema, ({ deps, identity, onSteps }, { identity: profile, site }) =>
    suggestPositioning(deps.ai, aiMeta(identity), profile, site, onSteps),
  ),

  'visual-style': kind(visualStyleRequestSchema, ({ deps, identity, log, onSteps }, request) =>
    proposeVisualStyle(deps, identity, request, { log, onSteps }),
  ),

  // Dal Profilo o dall'onboarding: il profilo si restituisce, lo salva chi salva la sezione.
  'video-profile': kind(visualStyleRequestSchema.omit({ restart: true }), ({ deps, identity, onSteps }, request) =>
    proposeVideoProfile(deps, identity, request, onSteps),
  ),

  // «Rifai la musica» dal Profilo: una libreria nuova di tracce del brand, salvata sul brand.
  'brand-music': kind(
    brandRef,
    ({ deps, identity, onSteps }, { brandId }) => remakeBrandMusic(deps, identity, brandId, onSteps),
    (deps, result) => signBrand(deps.media.storage, result as Brand),
  ),

  ideas: kind(generateIdeasSchema.extend(brandRef.shape), ({ deps, identity, onSteps }, { brandId, count }) =>
    generateBrandIdeas(deps, identity, brandId, count, onSteps),
  ),

  'content-prepare': kind(
    formatOptionSchema.extend({ slotId: z.uuid() }),
    ({ deps, identity, onSteps }, { slotId, format }) => prepareContent(deps, identity, slotId, format, onSteps),
    signWithSlot,
  ),

  'content-direct': kind(
    directContentSchema.extend(brandRef.shape),
    ({ deps, identity, onSteps }, { brandId, ...request }) => createDirectContent(deps, identity, brandId, request, onSteps),
    signOne,
  ),

  'content-from-idea': kind(
    ideaRefSchema.extend(brandRef.shape),
    ({ deps, identity, onSteps }, { brandId, ideaId, channels }) =>
      createContentFromIdea(deps, identity, brandId, ideaId, channels, onSteps),
    signOne,
  ),

  'content-regenerate': kind(
    formatOptionSchema.extend(contentRef.shape),
    ({ deps, identity, onSteps }, { contentId, format }) => regenerateContent(deps, identity, contentId, format, onSteps),
    signOne,
  ),

  'content-rewrite': kind(
    rewriteSchema.extend({ ...contentRef.shape, channel: channelIdSchema }),
    ({ deps, identity, onSteps }, { contentId, channel, instruction }) =>
      rewriteContentVariant(deps, identity, contentId, channel, instruction, onSteps),
    signOne,
  ),

  // Il montaggio del video, dalla regia com'è adesso: minuti, in coda come il disegno della card.
  'video-cut': kind(contentRef, ({ deps, identity, onSteps }, { contentId }) => cutContentVideo(deps, identity, contentId, onSteps), signOne),

  // «Non posso girarla»: una scena della regia rifatta con un'altra strada.
  // «Rifai la copertina»: dal montaggio che c'è, coi passi.
  'video-cover': kind(contentRef, ({ deps, identity, onSteps }, { contentId }) => makeContentCover(deps, identity, contentId, onSteps), signOne),

  'video-scene': kind(sceneRef, ({ deps, identity, onSteps }, { contentId, index }) =>
    replaceShootScene(deps, identity, contentId, index, onSteps),
    signOne,
  ),

  // Il b-roll di una scena: prima il fotogramma, poi la clip. Minuti, in coda, coi passi.
  'video-frame': kind(sceneRef, ({ deps, identity, onSteps }, { contentId, index }) =>
    makeBrollFrame(deps, identity, contentId, index, onSteps),
    signOne,
  ),

  'video-clip': kind(sceneRef, ({ deps, identity, onSteps }, { contentId, index }) =>
    makeBrollClip(deps, identity, contentId, index, onSteps),
    signOne,
  ),

  'visual-design': kind(
    visualDesignSchema.extend(contentRef.shape),
    ({ deps, identity, onSteps }, { contentId, channels, instruction }) =>
      designContentVisual(deps, identity, contentId, channels, instruction, onSteps),
    signOne,
  ),
};

export type JobKindName = keyof typeof JOB_KINDS;
