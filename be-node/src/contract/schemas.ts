import { z } from 'zod';

import type {
  BrandDraft,
  BrandLine,
  BrandVideo,
  ChannelId,
  Channels,
  Identity,
  Positioning,
  References,
  SectionKey,
  Theme,
  Visual,
  VisualExample,
  Voice,
} from '@/domain/brand';
import { REWRITE_LIMIT } from '@/domain/content';
import type { IdeaDraft, IdeaSource } from '@/domain/idea';
import type { PlanRequest, SlotDraft } from '@/domain/plan';
import { TEMPLATE_IDS, type MediaFile, type VisualEdit } from '@/domain/visual';

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
      level: z.enum(['often', 'sometimes', 'rarely']).optional(),
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

const cardTextSchema = z.object({
  kicker: text(200),
  headline: text(400),
  body: text(1000),
  value: text(60),
  items: z.array(z.object({ title: text(200), body: text(400) })).max(10),
  author: text(200),
});

/** Una pagina di card: il layout del motore e, se c'è, il template scritto per il brand. */
const pageSchema = z.object({ templateId: z.enum(TEMPLATE_IDS), custom: text(60).optional(), text: cardTextSchema });

const mediaFileSchema = z.object({ path: text(500).nullable(), url: text(4000) }) satisfies z.ZodType<MediaFile>;

const visualExampleSchema = z.object({
  channel: channelIdSchema,
  aspect: z.enum(['4:5', '1:1', '9:16', '1.91:1']),
  page: pageSchema,
  file: mediaFileSchema.nullable(),
  photo: mediaFileSchema.nullable().optional(),
  photoDescription: text(1000).optional(),
}) satisfies z.ZodType<VisualExample>;

const lineFontSchema = z.object({ font: text(60), weight: z.number().int().min(100).max(1000), italic: z.boolean() });

const lineSchema = z.object({
  // La composizione e i riferimenti d'origine mancano nelle prime linee.
  from: z.array(text(500)).max(6).optional(),
  templates: z
    .array(
      z.object({
        id: text(60),
        name: text(120),
        use: text(600),
        fields: z.array(text(20)).max(8),
        photo: z.boolean(),
        html: text(20_000),
        css: text(30_000),
      }),
    )
    .max(8)
    .optional(),
  fonts: z
    .array(z.object({ family: text(80), weights: z.array(z.number().int().min(100).max(900)).max(9), italic: z.boolean() }))
    .max(6)
    .optional(),
  photo: z.enum(['band', 'block', 'full']).optional(),
  inset: z.boolean().optional(),
  kicker: z.boolean().optional(),
  footer: z.enum(['rule', 'mark', 'none']).optional(),
  anchor: z.enum(['center', 'top', 'bottom']).optional(),
  ground: text(20),
  accent: text(20),
  voice: lineFontSchema,
  title: lineFontSchema,
  label: lineFontSchema.extend({ spaced: z.boolean() }),
  text: lineFontSchema,
  signature: text(200),
  address: text(200),
  band: z.object({ description: text(1000), photo: mediaFileSchema.nullable() }).nullable(),
  rubrics: z.array(z.object({ name: text(100), about: text(400) })).max(6),
  copy: z.array(text(400)).max(8),
}) satisfies z.ZodType<BrandLine>;

export const brandVideoSchema = z.object({
  real: text(1000),
  generated: text(1000),
  shots: z.array(text(300)).max(10),
  look: text(1000),
  sound: text(600),
}) satisfies z.ZodType<BrandVideo>;

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
  // Riferimenti, indicazioni ed esempi mancano nei brand salvati prima dello stile dai riferimenti.
  references: z.array(mediaFileSchema).max(6).optional(),
  notes: text(2000).optional(),
  direction: z.object({ summary: text(600), photoStyle: text(1500) }).nullable().optional(),
  // La linea grafica manca nei brand salvati prima del motore delle card.
  line: lineSchema.nullable().optional(),
  examples: z.array(visualExampleSchema).max(5).optional(),
  // Il profilo video manca nei brand salvati prima del Video Studio.
  video: brandVideoSchema.nullable().optional(),
  music: z
    .array(
      z.object({
        id: text(60),
        mood: text(120),
        bpm: z.number().min(40).max(220),
        seconds: z.number().min(3).max(600),
        file: mediaFileSchema,
      }),
    )
    .max(8)
    .optional(),
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

/** Quello che la lettura del sito ha capito: il contesto per obiettivi e pubblico. */
const siteContextSchema = z.object({
  site: text(300),
  summary: text(1000),
  pitch: text(2000),
  themes: z.array(text(200)).max(10),
  audiences: z.array(text(200)).max(10),
});

export const positioningRequestSchema = z.object({ identity: identitySchema, site: siteContextSchema.nullable() });

export const visualStyleRequestSchema = z.object({
  identity: identitySchema,
  themes: z.array(text(120)).max(6),
  visual: visualSchema,
  channels: channelList.min(1),
  goals: z.array(text(200)).max(10).optional(),
  audiences: z.array(text(200)).max(10).optional(),
  voice: voiceSchema.shape.cards.element.nullable().optional(),
  siteSummary: text(2000).optional(),
  restart: z.boolean().optional(),
});

/** Il girato o la foto di una scena: prima si chiede dove caricarlo, poi si dice cosa si è caricato. */
export const footageUploadSchema = z.object({ mimeType: z.string().min(3).max(60), bytes: z.number().int().positive() });
export const footageAttachSchema = z.object({ path: z.string().min(1).max(500).nullable() });
export const sceneLockSchema = z.object({ locked: z.boolean() });
/** La musica del video: l'id di una traccia del brand, `null` per nessuna, `auto` perché la scelga chi monta. */
export const contentMusicSchema = z.object({ musicId: z.string().min(1).max(60).nullable() });

/** Un'immagine di riferimento come data URI: tipo e misura li controlla il servizio, come per le foto. */
export const referenceUploadSchema = z.object({ dataUri: z.string().min(1).max(5_000_000) });

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
// I canali li sceglie chi guarda l'idea; senza scelta valgono quelli dell'idea.
export const ideaRefSchema = z.object({ ideaId: z.uuid(), channels: channelList.min(1).optional() });

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
// Come esce su un canale: riguarda il visivo, non il testo.
export const variantLayoutSchema = z.object({ format: formatSchema.optional(), withoutImage: z.boolean().optional() });
// Un ritocco: uno dei suggerimenti pronti o una richiesta scritta dall'utente.
export const rewriteSchema = z.object({ instruction: z.string().trim().min(1).max(REWRITE_LIMIT) });
export const scheduleSchema = z.object({ date: day, time: hourMinute, publishNow: z.boolean().optional() });

// ---------------------------------------------------------------------------
// Visivi
// ---------------------------------------------------------------------------

/** Le modifiche senza AI. I testi li taglia il dominio: qui si ferma solo quello che è fuori misura. */
export const visualEditSchema = z.object({
  kind: z.enum(['infographic', 'photo', 'mixed']),
  pages: z.array(pageSchema).max(20),
  description: text(2000),
  source: z.enum(['generated', 'upload']),
  reopen: z.boolean().default(false),
}) satisfies z.ZodType<VisualEdit>;

/**
 * Il visivo disegnato da capo. `channels` dice per quali formati la card deve reggere: vuoto
 * significa tutti quelli del contenuto.
 */
export const visualDesignSchema = z.object({
  channels: channelList.default([]),
  instruction: text(500).optional(),
});

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
