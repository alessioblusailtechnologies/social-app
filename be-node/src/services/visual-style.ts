import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';

import type { ImageStyle, TypographyId, VisualExample } from '@/domain/brand';
import { channelName, IMAGE_STYLES, imageStyleLabel, TYPOGRAPHY_OPTIONS, typographyName } from '@/domain/catalog';
import {
  aspectFor,
  brandKit,
  CARD_LIMITS,
  chooseTemplate,
  cleanCardText,
  clip,
  EXAMPLE_TEMPLATES,
  templateSpec,
  type CardField,
  type TemplateSpec,
} from '@/domain/visual';
import { createStepLog, VISUAL_STEPS } from '@/services/ai-steps';
import type { OnAiSteps, VisualStyle, VisualStyleRequest } from '@/services/types';

import { APP_CONTEXT, describeIdentity } from '../ai/brand-context';
import { ApiError } from '../contract/errors';
import type { Identity as Caller } from '../db/identity';
import type { MediaBytes } from '../media/images';
import { profileMediaPath } from '../visual/files';
import { aiMeta, type Deps } from './deps';

/**
 * Lo stile delle card dal profilo: Gemini guarda le immagini di riferimento e legge le indicazioni, sceglie caratteri
 * e stile dal catalogo dei template e scrive i testi di una card di esempio per canale; be-render le compone con
 * Remotion. Se be-render non risponde gli esempi restano senza PNG e l'app li disegna dal vivo.
 */

const MAX_REFERENCES = 6;
const MAX_CHANNELS = 5;

const IMAGE_STYLE_HINTS: Record<ImageStyle, string> = {
  'flat-geometric': 'card grafiche con forme geometriche piatte nei colori del brand; foto semplici e pulite',
  'desaturated-photo': 'foto dai toni spenti e desaturati, aria editoriale; card senza forme decorative',
  'natural-photo': 'foto naturali, luce vera e colori fedeli; card senza forme decorative',
  'text-only': 'solo testo e colore, niente forme decorative né foto',
};

const FIELD_HINTS: Record<Exclude<CardField, 'items' | 'author'>, string> = {
  kicker: 'kicker (etichetta di 2 o 3 parole, per esempio il tema)',
  headline: `headline (al massimo ${CARD_LIMITS.headline} caratteri)`,
  body: `body (facoltativo, al massimo ${CARD_LIMITS.body} caratteri)`,
  value: 'value (un numero breve come «3 ore»; se non è un dato del brand, tra parentesi quadre: «[3 ore]»)',
};

function fieldsHint(spec: TemplateSpec): string {
  return spec.fields
    .flatMap((field) => {
      if (field === 'author') return [];
      if (field === 'items') {
        const { min = 3, max = 4, titled = false } = spec.items ?? {};
        return [`items (da ${min} a ${max} voci${titled ? ', ognuna con title breve e body' : ', ognuna con title breve'})`];
      }
      return [FIELD_HINTS[field]];
    })
    .join(', ');
}

/** Gemini a volte scrive null al posto di una stringa vuota: vale come vuota. */
const loose = z
  .string()
  .nullish()
  .transform((value) => value ?? '');

const resultSchema = z.object({
  typography: loose,
  imageStyle: loose,
  summary: loose,
  photoStyle: loose,
  examples: z
    .array(
      z.object({
        kicker: loose,
        headline: loose,
        body: loose,
        value: loose,
        items: z
          .array(z.object({ title: loose, body: loose }))
          .nullish()
          .transform((items) => items ?? []),
      }),
    )
    .nullish()
    .transform((examples) => examples ?? []),
});

const isTypography = (value: string): value is TypographyId => TYPOGRAPHY_OPTIONS.some((option) => option.id === value);
const isImageStyle = (value: string): value is ImageStyle => IMAGE_STYLES.some((style) => style.id === value);

export async function proposeVisualStyle(
  deps: Deps,
  caller: Caller,
  request: VisualStyleRequest,
  options: { log: FastifyBaseLogger; onSteps?: OnAiSteps },
): Promise<VisualStyle> {
  const { storage, renderer, vision } = deps.media;
  if (!vision.available) {
    throw ApiError.unavailable('VISION_UNAVAILABLE', 'L’analisi delle immagini non è configurata su questo server.');
  }
  const log = createStepLog(options.onSteps);
  const { identity, visual } = request;
  const notes = visual.notes?.trim() ?? '';
  const channels = [...new Set(request.channels)].slice(0, MAX_CHANNELS);
  const references = (visual.references ?? [])
    .flatMap((file) => (file.path?.startsWith(`${caller.accountId}/`) ? [file.path] : []))
    .slice(0, MAX_REFERENCES);

  log.start('references', VISUAL_STEPS.references(references.length), notes ? `Indicazioni: ${clip(notes, 80)}` : undefined);
  let images: MediaBytes[];
  try {
    images = await Promise.all(
      references.map(async (path) => {
        const file = await storage.download(path);
        return { bytes: file.bytes, mimeType: file.contentType };
      }),
    );
  } catch (error) {
    options.log.error({ err: error }, 'riferimenti non letti');
    log.finish('references', { failed: true });
    throw new ApiError(502, 'REFERENCES_UNREADABLE', 'Non riesco a leggere le immagini di riferimento: ricaricale e riprova.');
  }
  log.finish('references');

  log.start('style', VISUAL_STEPS.style);
  const [primary, secondary, accent, ground] = visual.palette.colors;
  const examplePlan = channels.map((channel, index) => {
    const spec = templateSpec(EXAMPLE_TEMPLATES[index % EXAMPLE_TEMPLATES.length]);
    return `${index + 1}. per ${channelName(channel)}: layout «${spec.name}», ${spec.hint}. Campi: ${fieldsHint(spec)}.`;
  });
  const raw = await vision.json({
    task: 'visual-style',
    images,
    meta: aiMeta(caller),
    prompt: [
      `${APP_CONTEXT} Fai il direttore artistico: scegli lo stile delle card social di questo brand.`,
      '',
      describeIdentity(identity),
      request.themes.length > 0 ? `Temi: ${request.themes.join(', ')}` : '',
      `Palette, che resta questa: principale ${primary}, secondario ${secondary}, accento ${accent}, sfondo ${ground}.`,
      images.length > 0
        ? `Le ${images.length === 1 ? 'immagine allegata è il riferimento scelto' : `${images.length} immagini allegate sono i riferimenti scelti`} dall’utente: guardane caratteri, pesi, spazi, forme e trattamento delle foto. Non copiarne testi o marchi.`
        : 'Non ci sono immagini di riferimento: decidi da chi è il brand e dalla palette.',
      notes ? `Indicazioni dell’utente, che contano più dei riferimenti: «${notes}»` : '',
      '',
      'Rispondi solo con un oggetto JSON con questi campi:',
      `- typography: uno di questi id, la coppia di caratteri più vicina ai riferimenti: ${TYPOGRAPHY_OPTIONS.map((option) => `"${option.id}" (${option.name}: titoli in ${option.heading.family}, testi in ${option.body.family})`).join('; ')}.`,
      `- imageStyle: uno di questi id: ${IMAGE_STYLES.map((style) => `"${style.id}" (${IMAGE_STYLE_HINTS[style.id]})`).join('; ')}.`,
      '- summary: in italiano, una frase che descrive all’utente lo stile scelto, per esempio «Titoli con le grazie, tanto spazio bianco e foto dai toni caldi».',
      '- photoStyle: in inglese, una o due frasi sullo stile delle foto che il modello d’immagine dovrà seguire (luce, colore, grana, inquadrature), senza nominare marchi né persone.',
      `- examples: ${channels.length} card di esempio, in quest’ordine, con testi in italiano sui temi del brand; niente dati inventati se non tra parentesi quadre:`,
      ...examplePlan,
      '  Ogni card è un oggetto con kicker, headline, body, value e items ({ title, body }); i campi che il layout non usa restano vuoti.',
      'Scrivi in italiano semplice, senza trattini lunghi.',
    ]
      .filter(Boolean)
      .join('\n'),
  });

  const parsed = resultSchema.safeParse(raw);
  if (!parsed.success) {
    options.log.error({ problem: parsed.error.message }, 'stile delle card fuori schema');
    throw new ApiError(502, 'VISION_FAILED', 'Non sono riuscito a scegliere lo stile. Riprova.');
  }
  const result = parsed.data;
  const typography = isTypography(result.typography) ? result.typography : visual.typography;
  const imageStyle = isImageStyle(result.imageStyle) ? result.imageStyle : visual.imageStyle;
  log.finish('style', { detail: `Caratteri «${typographyName(typography)}» · ${imageStyleLabel(imageStyle).toLowerCase()}` });

  const kit = brandKit({ identity, visual: { ...visual, typography, imageStyle } });
  // Il logo passa solo se be-render lo può aprire: un percorso del telefono non si vede dal server.
  const logoUrl = kit.logoUrl && /^(https:|data:image\/)/.test(kit.logoUrl) ? kit.logoUrl : null;
  const renderKit = { ...kit, logoUrl, signature: kit.signature && logoUrl !== null };

  const examples: VisualExample[] = [];
  let renderDown = false;
  for (const [index, channel] of channels.entries()) {
    const aspect = aspectFor(channel, 'post');
    const text = cleanCardText(result.examples[index] ?? { headline: identity.pitch });
    const page = { templateId: chooseTemplate('infographic', text, EXAMPLE_TEMPLATES[index % EXAMPLE_TEMPLATES.length]), text };
    const step = `card-${channel}`;
    log.start(step, VISUAL_STEPS.card(channelName(channel)), `Formato ${aspect}`);
    if (renderDown) {
      examples.push({ channel, aspect, page, file: null });
      log.finish(step, { failed: true, detail: 'La disegno dall’app: il servizio delle card non risponde' });
      continue;
    }
    try {
      const png = await renderer.render({ kit: renderKit, page, pageIndex: 0, pageCount: 1, photoUrl: null, cutoutUrl: null, aspect });
      const path = profileMediaPath(caller.accountId, 'image/png');
      await storage.upload(path, png, 'image/png');
      examples.push({ channel, aspect, page, file: { path, url: '' } });
      log.finish(step);
    } catch (error) {
      // Un servizio che non risponde non risponderà nemmeno alla card dopo: le altre si disegnano dall'app.
      options.log.error({ err: error, channel }, 'card di esempio non composta');
      renderDown = true;
      examples.push({ channel, aspect, page, file: null });
      log.finish(step, { failed: true, detail: 'La disegno dall’app: il servizio delle card non risponde' });
    }
  }

  const paths = examples.flatMap((example) => (example.file?.path ? [example.file.path] : []));
  const urls = await storage.sign(paths).catch(() => new Map<string, string>());
  return {
    typography,
    imageStyle,
    direction: { summary: clip(result.summary, 300), photoStyle: clip(result.photoStyle, 600) },
    examples: examples.map((example) =>
      example.file?.path ? { ...example, file: { ...example.file, url: urls.get(example.file.path) ?? '' } } : example,
    ),
  };
}

/** Un'immagine di riferimento caricata dal profilo: stesso controllo di tipo e misura delle foto dei post. */
export async function uploadReference(
  deps: Deps,
  caller: Caller,
  photo: MediaBytes,
): Promise<{ path: string; url: string }> {
  const path = profileMediaPath(caller.accountId, photo.mimeType);
  try {
    await deps.media.storage.upload(path, photo.bytes, photo.mimeType);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, 'UPLOAD_FAILED', 'Non sono riuscito a salvare l’immagine. Riprova.');
  }
  const urls = await deps.media.storage.sign([path]).catch(() => new Map<string, string>());
  return { path, url: urls.get(path) ?? '' };
}
