import { z } from 'zod';

import type {
  BrandDraft,
  ChannelId,
  Channels,
  Identity,
  Positioning,
  References,
  SectionKey,
  Theme,
  Visual,
  Voice,
} from '@/domain/brand';
import { REWRITE_INSTRUCTIONS } from '@/domain/content';
import type { IdeaDraft, IdeaSource } from '@/domain/idea';
import type { PlanRequest, SlotDraft } from '@/domain/plan';
import { TEMPLATE_IDS, type VisualEdit } from '@/domain/visual';

/**
 * I corpi delle richieste, validati all'ingresso. Ogni schema dichiara il tipo del dominio
 * che produce (`satisfies`): se il FE cambia un tipo, il BE non compila finché non si allinea.
 */

const text = (max: number) => z.string().max(max);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data YYYY-MM-DD');
const hourMinute = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'orario HH:mm');

export const channelIdSchema = z.enum(['linkedin', 'instagram', 'facebook', 'tiktok', 'x']) satisfies z.ZodType<ChannelId>;
const channelList = z.array(channelIdSchema).max(5);
export const formatSchema = z.enum(['post', 'carousel', 'video', 'article']);

export const identitySchema = z.object({
  kind: z.enum(['person', 'company', 'client']),
  name: text(200),
  role: text(200),
  company: text(200),
  sector: text(200),
  site: text(300),
  pitch: text(2000),
}) satisfies z.ZodType<Identity>;

const positioningSchema = z.object({
  goals: z.array(text(200)).max(20),
  audiences: z.array(text(200)).max(20),
  postsPerWeek: z.number().int().min(0).max(21),
}) satisfies z.ZodType<Positioning>;

const channelStateSchema = z.object({ selected: z.boolean(), handle: text(200).nullable() });

const channelsSchema = z.object({
  linkedin: channelStateSchema,
  instagram: channelStateSchema,
  facebook: channelStateSchema,
  tiktok: channelStateSchema,
  x: channelStateSchema,
}) satisfies z.ZodType<Channels>;

const themesSchema = z
  .array(
    z.object({
      id: z.string().min(1).max(100),
      name: text(120),
      weight: z.number().int().min(0).max(100),
      color: text(40),
    }),
  )
  .max(6) satisfies z.ZodType<Theme[]>;

const voiceSourceSchema = z.enum(['pasted', 'history', 'recording']);

const voiceSchema = z.object({
  cards: z
    .array(
      z.object({
        version: z.number().int().min(0),
        createdAt: text(40),
        source: voiceSourceSchema,
        sourceLabel: text(200),
        register: text(2000),
        rhythm: text(2000),
        lexicon: text(2000),
        avoid: text(2000),
      }),
    )
    .max(50),
}) satisfies z.ZodType<Voice>;

const visualSchema = z.object({
  // Sul web il logo può arrivare come data URI: il tetto sta sotto il limite del corpo.
  logoUri: text(3_000_000).nullable(),
  palette: z.object({
    id: text(200),
    name: text(200),
    colors: z.tuple([text(40), text(40), text(40), text(40)]),
    origin: z.enum(['preset', 'site', 'custom']),
  }),
  imageStyle: z.enum(['flat-geometric', 'desaturated-photo', 'natural-photo', 'text-only']),
  // I brand salvati prima dei caratteri non lo mandano: prendono la coppia di base.
  typography: z
    .enum(['inter', 'archivo', 'space-grotesk', 'manrope', 'fraunces', 'dm-serif', 'playfair', 'ibm-plex'])
    .default('inter'),
  signature: z.boolean(),
}) satisfies z.ZodType<Visual>;

const referencesSchema = z.object({
  profiles: z.array(text(300)).max(50),
  sources: z.array(z.object({ label: text(200), enabled: z.boolean() })).max(30),
  milestones: z.array(z.object({ id: z.string().min(1).max(100), label: text(200), date: day })).max(50),
}) satisfies z.ZodType<References>;

export const sectionSchemas = {
  identity: identitySchema,
  positioning: positioningSchema,
  channels: channelsSchema,
  themes: themesSchema,
  voice: voiceSchema,
  visual: visualSchema,
  references: referencesSchema,
} satisfies { [K in SectionKey]: z.ZodType<BrandDraft[K]> };

export const brandDraftSchema = z.object(sectionSchemas) satisfies z.ZodType<BrandDraft>;

// ---------------------------------------------------------------------------
// AI del profilo
// ---------------------------------------------------------------------------

export const websiteRequestSchema = z.object({ site: z.string().trim().min(3).max(300), identity: identitySchema });

export const themesRequestSchema = z.object({ identity: identitySchema });

export const voiceRequestSchema = z.object({
  sample: z.object({
    source: voiceSourceSchema,
    texts: text(60_000).optional(),
    channel: channelIdSchema.optional(),
  }),
  identity: identitySchema,
});

// ---------------------------------------------------------------------------
// Idee
// ---------------------------------------------------------------------------

export const ideaSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('prompt'), text: z.string().trim().min(1).max(5000) }),
  z.object({ kind: z.literal('link'), url: z.string().trim().min(1).max(2000), note: text(2000) }),
  z.object({
    kind: z.literal('document'),
    name: z.string().min(1).max(300),
    size: z.number().int().nonnegative().nullable(),
    note: text(2000),
  }),
]) satisfies z.ZodType<IdeaSource>;

export const ideaDraftSchema = z.object({
  title: z.string().trim().min(1).max(300),
  angleLabel: text(120),
  angle: text(2000),
  rationale: text(1000),
  themeId: z.string().max(100).nullable(),
  signal: z.object({
    kind: z.enum(['theme', 'trend', 'recurrence', 'season', 'network', 'prompt', 'link', 'document']),
    label: text(200),
  }),
  source: ideaSourceSchema.nullable(),
  formats: z.array(formatSchema).min(1).max(4),
  channels: channelList,
}) satisfies z.ZodType<IdeaDraft>;

export const generateIdeasSchema = z.object({ count: z.number().int().min(1).max(12).default(8) });
export const draftIdeasSchema = z.object({ source: ideaSourceSchema, variant: z.number().int().min(0).max(1000).default(0) });
export const saveIdeasSchema = z.object({ drafts: z.array(ideaDraftSchema).min(1).max(20) });
export const ideaStatusSchema = z.object({ status: z.enum(['new', 'saved', 'discarded']) });

// ---------------------------------------------------------------------------
// Piano
// ---------------------------------------------------------------------------

export const planRequestSchema = z.object({
  startDate: day,
  weeks: z.number().int().min(1).max(12),
  perWeek: z.number().int().min(1).max(7),
  channels: channelList,
}) satisfies z.ZodType<PlanRequest>;

export const slotDraftSchema = z.object({
  date: day,
  time: hourMinute,
  channels: channelList.min(1),
  themeId: z.string().max(100).nullable(),
  ideaId: z.uuid().nullable(),
}) satisfies z.ZodType<SlotDraft>;

export const confirmPlanSchema = z.object({ drafts: z.array(slotDraftSchema).max(120) });
export const ideaRefSchema = z.object({ ideaId: z.uuid() });

export const slotPatchSchema = z.object({
  date: day.optional(),
  time: hourMinute.optional(),
  channels: channelList.min(1).optional(),
  ideaId: z.uuid().nullable().optional(),
  themeId: z.string().max(100).nullable().optional(),
  status: z.enum(['empty', 'toPrepare', 'toApprove', 'scheduled', 'published']).optional(),
});

// ---------------------------------------------------------------------------
// Contenuti
// ---------------------------------------------------------------------------

export const formatOptionSchema = z.object({ format: formatSchema.optional() });

export const directContentSchema = z.object({
  source: ideaSourceSchema,
  channels: channelList.min(1),
  format: formatSchema,
});

export const variantTextSchema = z.object({ text: text(10_000) });
export const rewriteSchema = z.object({ instruction: z.enum(REWRITE_INSTRUCTIONS) });
export const scheduleSchema = z.object({ date: day, time: hourMinute, publishNow: z.boolean().optional() });

// ---------------------------------------------------------------------------
// Visivi
// ---------------------------------------------------------------------------

const cardTextSchema = z.object({
  kicker: text(200),
  headline: text(400),
  body: text(1000),
  value: text(60),
  items: z.array(z.object({ title: text(200), body: text(400) })).max(10),
  author: text(200),
});

/** Le modifiche senza AI. I testi li taglia il dominio: qui si ferma solo quello che è fuori misura. */
export const visualEditSchema = z.object({
  kind: z.enum(['infographic', 'photo', 'mixed']),
  pages: z.array(z.object({ templateId: z.enum(TEMPLATE_IDS), text: cardTextSchema })).max(20),
  description: text(2000),
  source: z.enum(['generated', 'upload']),
  reopen: z.boolean().default(false),
}) satisfies z.ZodType<VisualEdit>;

/** La foto dell'utente come data URI: il controllo di tipo e misura lo fa il servizio. */
export const photoUploadSchema = z.object({ dataUri: z.string().min(1).max(5_000_000) });

// ---------------------------------------------------------------------------
// Sessione
// ---------------------------------------------------------------------------

export const signUpSchema = z.object({
  email: z.email().max(320),
  password: z.string().min(8, 'La password deve avere almeno 8 caratteri.').max(200),
  name: text(120).optional(),
});

export const signInSchema = z.object({ email: z.email().max(320), password: z.string().min(1).max(200) });
export const refreshSchema = z.object({ refreshToken: z.string().min(1).max(2000) });

/** Un id di percorso non valido è una risorsa che non c'è, non una richiesta rotta. */
export const idParam = z.uuid();
