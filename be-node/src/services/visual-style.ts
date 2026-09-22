import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';

import type { BrandLine, BrandTemplate, ImageStyle, TemplateFont, VisualExample } from '@/domain/brand';
import { channelName, IMAGE_STYLES } from '@/domain/catalog';
import { cleanTemplates, exampleChannels, sameReferences, TEMPLATE_FIELDS, templateFallback } from '@/domain/line';
import {
  aspectFor,
  brandKit,
  CARD_LIMITS,
  cleanCardText,
  clip,
  defaultLine,
  photoAspectFor,
  siteLabel,
  type Aspect,
  type MediaFile,
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
 * Il motore delle card costruito per ogni brand, come il generatore scritto a mano per Velia: il direttore artistico
 * (un Claude che vede le immagini) guarda i riferimenti e scrive i template del brand in HTML e CSS, poi li usa per le
 * prime card. Il motore (`src/templates/custom.tsx`) li riempie, li ripulisce e li disegna, nell'app e con Remotion.
 *
 * Il prompt dice il compito (card simili ai riferimenti, per questo brand), il brand e cosa sa fare il motore; tutto
 * il resto lo decide il modello. Senza la chiave di Anthropic, Gemini descrive i riferimenti e il modello dei testi
 * scrive i template.
 *
 * Con una linea nata dagli stessi riferimenti e un'indicazione scritta è una correzione: il modello riceve i template e
 * le card di prima e cambia solo quello che si chiede; le foto restano, si ritoccano o si rifanno. Ogni card con la
 * foto ha la sua, fatta dal modello d'immagine in parallelo; i riferimenti non gli arrivano, ne copierebbe i riquadri.
 */

const MAX_REFERENCES = 6;
const MAX_FONTS = 5;

const IMAGE_STYLE_HINTS: Record<ImageStyle, string> = {
  'flat-geometric': 'foto semplici e pulite, composizioni ordinate',
  'desaturated-photo': 'foto dai toni spenti e desaturati, aria editoriale',
  'natural-photo': 'foto naturali, luce vera e colori fedeli',
  'text-only': 'niente foto: solo testo e colore',
};
const IMAGE_STYLE_IDS = IMAGE_STYLES.map((style) => style.id) as [ImageStyle, ...ImageStyle[]];

/** Quello che il direttore artistico consegna: i template del brand, le card d'esempio e il resto della linea. */
const systemShape = {
  seen: z
    .string()
    .describe('In italiano, per ogni immagine allegata: che tipo di card è (foto pura, foto con testo, solo testo), composizione, caratteri e stile.'),
  templates: z.array(
    z.object({
      id: z.string().describe('Breve, minuscolo col trattino, es. "foto-titolo".'),
      name: z.string().describe('In italiano, per l’utente.'),
      use: z.string().describe('In italiano, quando usarlo: lo legge chi scriverà i post.'),
      fields: z.array(z.enum(TEMPLATE_FIELDS)).describe('I segnaposti di testo che il template mostra.'),
      photo: z.boolean().describe('true se il template mostra {{photo}}.'),
      html: z.string(),
      css: z.string(),
    }),
  ),
  fonts: z.array(z.object({ family: z.string(), weights: z.array(z.number().int()), italic: z.boolean() })),
  examples: z.array(
    z.object({
      template: z.string().describe('L’id del template.'),
      kicker: z.string(),
      headline: z.string(),
      body: z.string(),
      value: z.string(),
      items: z.array(z.object({ title: z.string(), body: z.string() })),
      author: z.string(),
      photo: z.string().describe('In italiano, cosa mostra la foto della card; vuota se il template non ha foto.'),
    }),
  ),
  imageStyle: z.enum(IMAGE_STYLE_IDS),
  photoSubject: z.string().describe('In italiano, una foto tipica del brand, per i post futuri.'),
  photoStyle: z.string().describe('In inglese, lo stile fotografico, per il modello d’immagine.'),
  signature: z.string(),
  address: z.string(),
  rubrics: z.array(z.object({ name: z.string(), about: z.string() })),
  copy: z.array(z.string()),
  summary: z.string().describe('In italiano, una o due frasi per l’utente su come sono le card e perché.'),
};

const systemSchema = z.object(systemShape);
const refineSchema = z.object({
  ...systemShape,
  photoChange: z.enum(['keep', 'edit', 'new']).describe('Cosa fare delle foto di prima: tenerle, ritoccarle, rifarle.'),
  photoEdit: z.string().describe('In inglese, il ritocco da fare alle foto di prima; vuota se photoChange non è "edit".'),
});
type BrandSystem = z.output<typeof systemSchema>;
type PhotoChange = 'keep' | 'edit' | 'new';

/** Gemini, quando manca il direttore artistico: descrive i riferimenti per il modello dei testi, che non li vede. */
const lookSchema = z.object({ look: z.string().catch('') });

const SYSTEM = `${APP_CONTEXT} Qui fai il direttore artistico: scrivi i template delle card social di un brand, in HTML e CSS per il motore dell’app, e li usi per le prime card.`;

const REFINER = `${APP_CONTEXT} Qui fai il direttore artistico: correggi i template e le card social di un brand come chiede l’utente. Cambi solo quello che chiede; il resto resta com’è.`;

// ---------------------------------------------------------------------------

export async function proposeVisualStyle(
  deps: Deps,
  caller: Caller,
  request: VisualStyleRequest,
  options: { log: FastifyBaseLogger; onSteps?: OnAiSteps },
): Promise<VisualStyle> {
  const { storage, renderer, vision, director } = deps.media;
  const log = createStepLog(options.onSteps);
  const { identity, visual } = request;
  const notes = visual.notes?.trim() ?? '';
  const channels = exampleChannels(request.channels);
  const meta = aiMeta(caller);
  const owned = (file: MediaFile | null | undefined) => (file?.path?.startsWith(`${caller.accountId}/`) ? file.path : null);
  const download = async (path: string): Promise<MediaBytes> => {
    const file = await storage.download(path);
    return { bytes: file.bytes, mimeType: file.contentType };
  };
  const references = (visual.references ?? []).flatMap((file) => (owned(file) ? [owned(file)!] : [])).slice(0, MAX_REFERENCES);
  // Con una linea nata dagli stessi riferimenti, un'indicazione è una correzione; con riferimenti nuovi o «da capo»,
  // una linea nuova.
  const previous = visual.line ?? null;
  const refine =
    !request.restart && previous !== null && (previous.templates?.length ?? 0) > 0 && notes.length > 0 && sameReferences(previous, references);

  // 1. Le immagini: i riferimenti sempre; in una correzione anche le card di prima, se chi corregge le vede.
  log.start('references', VISUAL_STEPS.references(references.length), notes ? `Indicazioni: ${clip(notes, 80)}` : undefined);
  let images: MediaBytes[];
  try {
    images = await Promise.all(references.map(download));
  } catch (error) {
    options.log.error({ err: error }, 'riferimenti non letti');
    log.finish('references', { failed: true });
    throw new ApiError(502, 'REFERENCES_UNREADABLE', 'Non riesco a leggere le immagini di riferimento: ricaricale e riprova.');
  }
  log.finish('references');
  const cards =
    refine && director.available
      ? await Promise.all((visual.examples ?? []).flatMap((example) => (owned(example.file) ? [download(owned(example.file)!)] : []))).catch(() => [])
      : [];
  options.log.info(
    { mode: refine ? 'correzione' : 'nuova', director: director.available, references: images.map((image) => image.mimeType), cards: cards.length },
    'linea grafica: si parte',
  );

  // 2. I template del brand: li scrive il direttore artistico guardando le immagini, o il modello dei testi.
  const lineLabel = refine ? VISUAL_STEPS.refine : VISUAL_STEPS.templates;
  log.start('line', lineLabel, refine ? `«${clip(notes, 80)}»` : VISUAL_STEPS.thinking);
  // Mentre il direttore artistico scrive, il passo dice quali template ha già scritto: il giro dura qualche minuto.
  let shown = '';
  const onProgress = (written: string) => {
    const detail = progressDetail(written);
    if (!detail || detail === shown) return;
    shown = detail;
    log.start('line', lineLabel, detail);
  };
  let result: BrandSystem;
  let photoChange: PhotoChange = 'new';
  let photoEdit = '';
  try {
    if (director.available) {
      const attached = [
        ...images.map((image, index) => ({ label: `Riferimento ${index + 1}:`, image })),
        ...cards.map((image, index) => ({ label: `Card attuale ${index + 1}:`, image })),
      ];
      if (refine && previous) {
        const corrected = await director.run({
          system: REFINER,
          images: attached,
          prompt: refinePrompt(request, previous, channels.length, images.length, cards.length),
          schema: refineSchema,
          meta,
          onProgress,
        });
        photoChange = corrected.photoChange;
        photoEdit = corrected.photoEdit.trim();
        result = corrected;
      } else {
        result = await director.run({
          system: SYSTEM,
          images: attached,
          prompt: systemPrompt(request, channels.length, images.length, ''),
          schema: systemSchema,
          meta,
          onProgress,
        });
      }
    } else {
      const look = images.length > 0 && vision.available ? await describeReferences(deps, images, meta, options.log) : '';
      if (refine && previous) {
        const corrected = await deps.ai.run({
          task: 'visual-style',
          system: REFINER,
          prompt: refinePrompt(request, previous, channels.length, 0, 0),
          schema: refineSchema,
          accountId: caller.accountId,
        });
        photoChange = corrected.photoChange;
        photoEdit = corrected.photoEdit.trim();
        result = corrected;
      } else {
        result = await deps.ai.run({
          task: 'visual-style',
          system: SYSTEM,
          prompt: systemPrompt(request, channels.length, 0, look),
          schema: systemSchema,
          accountId: caller.accountId,
        });
      }
    }
  } catch (error) {
    log.finish('line', { failed: true });
    throw error;
  }

  const templates = cleanTemplates(result.templates);
  if (templates.length === 0) {
    log.finish('line', { failed: true });
    throw new ApiError(502, 'AI_FAILED', 'Non sono riuscito a preparare i template delle card. Riprova.');
  }
  const imageStyle = result.imageStyle;
  const photos = imageStyle !== 'text-only';
  const plain = (text: string | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();
  // I layout del motore restano come riserva: la linea di base dalla palette e dai caratteri del brand.
  const line: BrandLine = {
    ...defaultLine(identity, visual),
    signature: clip(plain(result.signature), 60) || identity.name,
    address: siteLabel(plain(result.address)) || siteLabel(identity.site),
    rubrics: result.rubrics
      .map((rubric) => ({ name: clip(plain(rubric.name), 28), about: clip(plain(rubric.about), 140) }))
      .filter((rubric) => rubric.name)
      .slice(0, 4),
    copy: result.copy
      .map((rule) => clip(plain(rule), 140))
      .filter(Boolean)
      .slice(0, 6),
    templates,
    fonts: cleanFonts(result.fonts),
    band: null,
    from: references,
  };
  const direction = { summary: clip(plain(result.summary), 300), photoStyle: clip(plain(result.photoStyle), 600) };
  log.finish('line', { detail: templates.map((template) => `«${template.name}»`).join(', ') });
  options.log.info(
    {
      seen: result.seen,
      templates: templates.map((template) => `${template.id}${template.photo ? ' (foto)' : ''}`),
      examples: result.examples.map((example) => example.template),
      fonts: line.fonts?.map((font) => font.family),
      summary: direction.summary,
    },
    'linea grafica: le scelte',
  );

  // Le card d'esempio: il template lo ha scelto il direttore artistico.
  const templateFor = (id: string): BrandTemplate | undefined => {
    const key = id.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
    return templates.find((template) => template.id === key) ?? templates.find((template) => template.id.startsWith(key));
  };
  const plan = channels.map((channel, index) => {
    const draft = result.examples[index];
    const template = (draft && templateFor(draft.template)) ?? templates[index % templates.length];
    const description = template.photo && photos ? plain(draft?.photo) || plain(result.photoSubject) : '';
    const text = cleanCardText({
      kicker: plain(draft?.kicker),
      headline: plain(draft?.headline),
      body: plain(draft?.body),
      value: plain(draft?.value),
      items: (draft?.items ?? []).map((item) => ({ title: plain(item.title), body: plain(item.body) })),
      author: plain(draft?.author),
    });
    return { channel, aspect: aspectFor(channel, 'post'), template, text, description };
  });

  // 3. Le foto: una per card che ne ha una, in parallelo. In una correzione si tengono, si ritoccano o si rifanno.
  const jobs = plan.flatMap((card, index): PhotoJob[] =>
    card.description ? [{ index, description: card.description, before: owned(visual.examples?.[index]?.photo), aspect: card.aspect }] : [],
  );
  const made = new Map<number, MediaFile>();
  if (jobs.length > 0) {
    const mode: PhotoChange = refine ? photoChange : 'new';
    const label = mode === 'keep' ? VISUAL_STEPS.keepPhotos : mode === 'edit' ? VISUAL_STEPS.editPhotos : VISUAL_STEPS.photos(jobs.length);
    log.start('photos', label, clip(mode === 'new' ? jobs[0].description : notes, 80));
    const results = await Promise.all(
      jobs.map(async (job) => ({ job, file: await makePhoto(deps, caller, options.log, { ...job, mode, edit: photoEdit, style: direction.photoStyle }) })),
    );
    for (const { job, file } of results) if (file) made.set(job.index, file);
    const done = results.filter(({ file }) => file).length;
    log.finish('photos', done === jobs.length ? {} : { failed: done === 0, detail: `${done} di ${jobs.length}: le altre card escono senza foto` });
  }
  // La foto del brand, per le copertine dei caroselli coi layout del motore: la prima foto delle card.
  const first = jobs.find((job) => made.has(job.index));
  line.band = first ? { description: first.description, photo: made.get(first.index)! } : null;

  // 4. Le card, composte da be-render coi template del brand.
  const kit = brandKit({ identity, visual: { ...visual, imageStyle, line } });
  // Il logo passa solo se be-render lo può aprire: un percorso del telefono non si vede dal server.
  const logoUrl = kit.logoUrl && /^(https:|data:image\/)/.test(kit.logoUrl) ? kit.logoUrl : null;
  const renderKit = { ...kit, logoUrl, signature: kit.signature && logoUrl !== null };

  const examples: VisualExample[] = [];
  let renderDown = false;
  for (const [index, card] of plan.entries()) {
    const photo = made.get(index) ?? null;
    const page = { templateId: templateFallback(card.template), custom: card.template.id, text: card.text };
    const example: VisualExample = {
      channel: card.channel,
      aspect: card.aspect,
      page,
      file: null,
      photo,
      ...(photo && { photoDescription: card.description }),
    };
    const step = `card-${index}`;
    log.start(step, VISUAL_STEPS.card(channelName(card.channel)), `Formato ${card.aspect}`);
    if (renderDown) {
      examples.push(example);
      log.finish(step, { failed: true, detail: 'La disegno dall’app: il servizio delle card non risponde' });
      continue;
    }
    try {
      const png = await renderer.render({
        kit: renderKit,
        page,
        pageIndex: 0,
        pageCount: 1,
        photoUrl: photo?.url || null,
        cutoutUrl: null,
        aspect: card.aspect,
      });
      const path = profileMediaPath(caller.accountId, 'image/png');
      await storage.upload(path, png, 'image/png');
      examples.push({ ...example, file: { path, url: '' } });
      log.finish(step);
    } catch (error) {
      // Un servizio che non risponde non risponderà nemmeno alla card dopo: le altre si disegnano dall'app.
      options.log.error({ err: error, channel: card.channel }, 'card di esempio non composta');
      renderDown = true;
      examples.push(example);
      log.finish(step, { failed: true, detail: 'La disegno dall’app: il servizio delle card non risponde' });
    }
  }

  const paths = examples.flatMap((example) => [example.file?.path]).filter((path): path is string => Boolean(path));
  const urls = await storage.sign(paths).catch(() => new Map<string, string>());
  const signed = (file: MediaFile | null | undefined) => (file?.path ? { ...file, url: urls.get(file.path) ?? file.url } : (file ?? null));
  return {
    typography: visual.typography,
    imageStyle,
    direction,
    line,
    examples: examples.map((example) => ({ ...example, file: signed(example.file) })),
  };
}

/** Dalla risposta a metà, i nomi dei template già scritti: «Scritti: «Foto e titolo», «Frase»». */
function progressDetail(written: string): string {
  const start = written.indexOf('"templates"');
  if (start < 0) return '';
  const end = written.indexOf('"fonts"', start);
  const part = written.slice(start, end < 0 ? undefined : end);
  const names = [...part.matchAll(/"name"\s*:\s*"((?:[^"\\]|\\.)+)"/g)].map((match) => match[1]);
  return names.length > 0 ? `Scritti: ${names.map((name) => `«${name}»`).join(', ')}` : 'Comincio a scriverli';
}

/** Le famiglie di Google Fonts: nomi puliti, pesi sensati, al massimo cinque. */
function cleanFonts(fonts: BrandSystem['fonts']): TemplateFont[] {
  const seen = new Set<string>();
  return fonts
    .map((font) => ({
      family: font.family.replace(/[^A-Za-z0-9 ]/g, '').replace(/\s+/g, ' ').trim(),
      weights: [...new Set(font.weights.filter((weight) => weight >= 100 && weight <= 900).map((weight) => Math.round(weight / 100) * 100))].sort(
        (a, b) => a - b,
      ),
      italic: font.italic,
    }))
    .filter((font) => font.family && !seen.has(font.family) && seen.add(font.family))
    .slice(0, MAX_FONTS);
}

/** Senza il direttore artistico, Gemini descrive i riferimenti; se non riesce, si va senza. */
async function describeReferences(deps: Deps, images: MediaBytes[], meta: ReturnType<typeof aiMeta>, log: FastifyBaseLogger): Promise<string> {
  try {
    const raw = await deps.media.vision.json({
      task: 'visual-style',
      images,
      meta,
      prompt:
        'Descrivi queste immagini a chi dovrà scrivere card social simili senza vederle: per ognuna, che tipo di card è (foto pura, foto con testo, solo testo), composizione, caratteri (genere, peso, maiuscole), colori, testi e stile delle foto. Rispondi solo con un oggetto JSON { "look": "…" }, in italiano.',
    });
    return clip(lookSchema.parse(raw).look, 3000);
  } catch (error) {
    log.error({ err: error }, 'riferimenti non descritti');
    return '';
  }
}

// ---------------------------------------------------------------------------
// Le foto
// ---------------------------------------------------------------------------

interface PhotoJob {
  /** La card a cui va. */
  index: number;
  description: string;
  /** La foto di prima nello stesso posto, se è dell'account. */
  before: string | null;
  aspect: Aspect;
}

/**
 * Una foto: tenuta, ritoccata partendo da quella di prima, o fatta nuova. Se non riesce, la card esce senza foto
 * invece di far fallire tutta la linea.
 */
async function makePhoto(
  deps: Deps,
  caller: Caller,
  log: FastifyBaseLogger,
  job: PhotoJob & { mode: PhotoChange; edit: string; style: string },
): Promise<MediaFile | null> {
  const { storage, images } = deps.media;
  try {
    if (job.mode === 'keep' && job.before) {
      const url = (await storage.sign([job.before])).get(job.before);
      if (url) return { path: job.before, url };
    }
    const aspectRatio = photoAspectFor([job.aspect]);
    const original = job.mode === 'edit' && job.edit && job.before ? await storage.download(job.before) : null;
    const image = await images.generate({
      prompt: original ? retouchPrompt(job.edit, aspectRatio) : photoPrompt(job.description, job.style, aspectRatio),
      aspectRatio,
      references: original ? [{ bytes: original.bytes, mimeType: original.contentType }] : [],
      meta: aiMeta(caller),
    });
    const path = profileMediaPath(caller.accountId, image.mimeType);
    await storage.upload(path, image.bytes, image.mimeType);
    const url = (await storage.sign([path])).get(path);
    if (!url) throw new Error(`${path} non si firma`);
    return { path, url };
  } catch (error) {
    log.error({ err: error, card: job.index }, 'foto della card non preparata');
    return null;
  }
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

// ---------------------------------------------------------------------------
// I prompt: il compito, il brand, cosa sa fare il motore. Nient'altro.
// ---------------------------------------------------------------------------

/** La foto di una card: cosa mostra, lo stile fotografico, e i vincoli del motore (a tutto campo, senza scritte). */
function photoPrompt(description: string, style: string, aspectRatio: string): string {
  return [
    `A photograph. Aspect ratio ${aspectRatio}.`,
    `What it shows (described in Italian): ${description.trim()}`,
    style.trim() ? `Photographic style: ${style.trim()}` : '',
    'One single full-bleed photograph that fills the whole image edge to edge: no borders, frames or margins around it.',
    'No text, letters, logos or watermarks: any text is added later by the layout.',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Il ritocco della foto di prima: cambia solo quello che l'utente ha chiesto, il resto resta com'era. */
function retouchPrompt(edit: string, aspectRatio: string): string {
  return [
    `Edit the attached photograph. Change only this: ${edit}`,
    'Keep everything else exactly as it is.',
    `Aspect ratio ${aspectRatio}.`,
    'One single full-bleed photograph that fills the whole image edge to edge: no borders, frames or margins around it.',
    'No text, letters, logos or watermarks.',
  ].join('\n');
}

const list = (items: readonly string[] | undefined) => (items && items.length > 0 ? items.join(', ') : 'non indicati');

function brandLines(request: VisualStyleRequest): string[] {
  const { identity, visual } = request;
  const voice = request.voice;
  return [
    '## Il brand',
    describeIdentity(identity),
    `Temi: ${list(request.themes)}`,
    voice ? `Voce: registro ${voice.register}; ritmo ${voice.rhythm}; lessico ${voice.lexicon}; da evitare ${voice.avoid}` : '',
    `Palette: ${visual.palette.colors.join(', ')} (principale, secondario, accento, sfondo).`,
    visual.logoUri ? 'Ha un logo.' : 'Non ha un logo.',
  ];
}

/** Cosa sa fare il motore, detto per quello che fa. */
function engineLines(): string[] {
  return [
    '## Il motore',
    '- Ogni template è HTML e CSS. Il motore mette l’HTML dentro <div class="card ratio-4x5">, largo 1080px; l’altezza cambia col formato del canale: 1350 (ratio-4x5), 1080 (ratio-1x1), 1920 (ratio-9x16), 565 (ratio-191x1). Lo stesso template deve funzionare in tutti i formati: flex e percentuali, e le classi ratio-* per i ritocchi. Nel 9:16 l’interfaccia dell’app copre 250px in alto e 380px in basso: var(--safe-top) e var(--safe-bottom).',
    '- Variabili CSS: --primary, --secondary, --accent, --ground (la palette del brand), --ink (un testo leggibile su --ground), --card-w, --card-h. Reset già fatto: box-sizing border-box, margini e padding a zero.',
    '- Segnaposti mustache nell’HTML: {{kicker}} {{headline}} {{body}} {{value}} {{author}}; {{#items}}{{index}} {{title}} {{body}}{{/items}} per i punti; {{brand}} {{signature}} {{address}}; {{page}} (es. "2/5" nei caroselli, vuoto altrimenti). {{#campo}}…{{/campo}} mostra il blocco solo se il campo c’è, {{^campo}}…{{/campo}} solo se manca.',
    '- La foto: <img src="{{photo}}"> (con object-fit: cover). Il logo: {{#logo}}<img src="{{logo}}">{{/logo}}. Nessun’altra immagine: forme, bollini e decorazioni con CSS o SVG inline.',
    '- data-fit su un elemento di testo: il motore rimpicciolisce il testo finché entra nel riquadro dell’elemento (che deve avere un’altezza data da flex o percentuale, con overflow hidden); data-fit-min="40" fissa il corpo minimo in px.',
    '- Caratteri: qualunque famiglia di Google Fonts, elencata in fonts coi pesi usati.',
    '- Il motore toglie script, attributi on*, link e url() esterni.',
    `- Le foto le genera un modello d’immagine dalla descrizione che scrivi, senza scritte: i testi li mette il template. Limiti dei testi: kicker ${CARD_LIMITS.kicker} caratteri, headline ${CARD_LIMITS.headline}, body ${CARD_LIMITS.body}, value ${CARD_LIMITS.value}, author ${CARD_LIMITS.author}; fino a ${CARD_LIMITS.items} punti (title ${CARD_LIMITS.itemTitle}, body ${CARD_LIMITS.itemBody}).`,
  ];
}

function returnLines(request: VisualStyleRequest, count: number): string[] {
  return [
    '## Cosa restituisci',
    '- seen: com’è fatta ogni immagine allegata.',
    '- templates: i template che servono per card come quelle (id, name, use, fields, photo, html, css); fonts: le famiglie di Google Fonts usate.',
    `- examples: ${count} card, ognuna con template (l’id), i testi dei segnaposti che il template usa (gli altri vuoti) e photo (cosa mostra la foto, se il template ne ha una).`,
    `- imageStyle, uno di: ${IMAGE_STYLES.map((style) => `"${style.id}" (${IMAGE_STYLE_HINTS[style.id]})`).join('; ')}; photoSubject e photoStyle: una foto tipica del brand e lo stile fotografico, per i post futuri.`,
    `- signature e address: la firma e il sito o l’account${request.identity.site ? ` (${request.identity.site})` : ''}, per {{signature}} e {{address}}; rubrics (name, about): le rubriche del brand, se ne ha, per {{kicker}} e per i post futuri; copy: le regole dei testi del brand, se ne vedi; summary.`,
  ];
}

function systemPrompt(request: VisualStyleRequest, count: number, references: number, look: string): string {
  const notes = request.visual.notes?.trim() ?? '';
  const similar =
    'dello stesso tipo (una foto pura dà foto pure, una card con testo dà card con testo), con la stessa composizione e lo stesso stile. Cambiano i soggetti e i colori, che sono del brand.';
  const task =
    references > 0
      ? `Scrivi i template delle card di questo brand e fanne ${count} d’esempio, simili ${references === 1 ? 'all’immagine allegata' : `alle ${references} immagini allegate`}: ${similar}`
      : look
        ? `Scrivi i template delle card di questo brand e fanne ${count} d’esempio, simili alle immagini di riferimento dell’utente, qui descritte: ${similar}\n\nLe immagini: ${look}`
        : `Scrivi i template delle card di questo brand e fanne ${count} d’esempio. Non ci sono immagini di riferimento.`;
  return [task, notes ? `L’utente chiede: «${notes}»` : '', '', ...brandLines(request), '', ...engineLines(), '', ...returnLines(request, count)]
    .filter(Boolean)
    .join('\n');
}

/** I template e le card di prima, come li restituirebbe chi li ha fatti. */
function currentSystem(request: VisualStyleRequest, line: BrandLine): Record<string, unknown> {
  const { visual } = request;
  return {
    templates: line.templates ?? [],
    fonts: line.fonts ?? [],
    examples: (visual.examples ?? []).map((example) => ({
      template: example.page.custom ?? '',
      ...example.page.text,
      photo: example.photoDescription ?? '',
    })),
    imageStyle: visual.imageStyle,
    photoSubject: line.band?.description ?? '',
    photoStyle: visual.direction?.photoStyle ?? '',
    signature: line.signature,
    address: line.address,
    rubrics: line.rubrics,
    copy: line.copy,
    summary: visual.direction?.summary ?? '',
  };
}

function refinePrompt(request: VisualStyleRequest, line: BrandLine, count: number, references: number, cards: number): string {
  const notes = request.visual.notes?.trim() ?? '';
  const attached = [
    references > 0 ? `${references === 1 ? 'il riferimento' : `i ${references} riferimenti`} da cui sono nate le card` : '',
    cards > 0 ? `le ${cards} card come l’utente le vede adesso, nell’ordine di examples` : '',
  ].filter(Boolean);
  return [
    `L’utente chiede: «${notes}»`,
    attached.length > 0 ? `Le immagini allegate sono ${attached.join(', poi ')}.` : '',
    '',
    '## I template e le card attuali',
    JSON.stringify(currentSystem(request, line), null, 2),
    '',
    ...brandLines(request),
    '',
    ...engineLines(),
    '',
    ...returnLines(request, count),
    '- photoChange: cosa fare delle foto di prima: "keep" per tenerle, "edit" per ritoccarle (photoEdit: in inglese, il ritocco), "new" per rifarle dalle descrizioni.',
  ]
    .filter(Boolean)
    .join('\n');
}
