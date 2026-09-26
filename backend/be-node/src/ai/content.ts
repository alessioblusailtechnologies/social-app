import { z } from 'zod';

import type { Brand, ChannelId } from '@shared/domain/brand';
import { channelName } from '@shared/domain/catalog';
import {
  CHANNEL_LIMITS,
  SCENE_SOURCES,
  type CarouselSlide,
  type ChannelVariant,
  type Content,
  type ContentVisual,
  type RewriteInstruction,
  type VideoScene,
} from '@shared/domain/content';
import { sourceTitle, type Idea, type IdeaFormat, type IdeaSource, type MaterialFile } from '@shared/domain/idea';
import {
  CARD_LIMITS,
  VISUAL_KINDS,
  VISUAL_KIND_LABELS,
  photoCarouselDesign,
  type VisualDesign,
} from '@shared/domain/visual';

import { REWRITE_STEPS, THINKING_STEP, WRITING_STEPS, createStepLog } from '@shared/services/ai-steps';
import type { OnAiSteps } from '@shared/services/types';

import { ApiError } from '../contract/errors';
import { channelIdSchema } from '../contract/schemas';
import { assertPublicUrl } from '../lib/public-url';
import { APP_CONTEXT, WRITING_RULES, describeBrand } from './brand-context';
import type { AiEngine, AiMeta } from './engine';
import { describeSource } from './ideas';
import { stepsFromTools } from './steps';
import { describeVideoProfile } from './video-profile';

/** Le bozze: una variante di testo per ogni canale, da un'idea o da una fonte dell'utente. */

const HASHTAG_COUNT: Record<ChannelId, number> = { linkedin: 3, instagram: 6, facebook: 2, tiktok: 4, x: 2 };

const CHANNEL_GUIDE: Record<ChannelId, string> = {
  linkedin:
    'la prima riga deve fermare lo scorrimento; paragrafi brevi separati da una riga vuota; da 700 a 1.500 caratteri, fino a 2.900 per un articolo',
  instagram:
    'didascalia da 300 a 900 caratteri con l’aggancio nella prima riga; per un carosello invita a scorrere, per un video a guardarlo fino alla fine',
  facebook: 'tono vicino e discorsivo, da 300 a 1.000 caratteri',
  tiktok: 'didascalia cortissima, una o due righe sotto i 150 caratteri: il contenuto è nel video',
  x: 'al massimo 250 caratteri, una sola idea',
};

const FORMAT_GUIDE: Record<IdeaFormat, string> = {
  post: 'Post: testo e un’immagine di copertina. headline è il titolo della copertina, fino a 60 caratteri; slides e scenes restano vuoti.',
  carousel:
    'Carosello: da 5 a 7 slide. La prima è l’aggancio, le centrali sviluppano un punto ciascuna, l’ultima chiude con un’azione; titoli fino a 40 caratteri, testi fino a 160. headline è il titolo della prima slide; scenes resta vuoto.',
  video: [
    'Video verticale breve, per reel, storie e TikTok. Oltre ai testi per canale scrivi lo script — aggancio, sviluppo e chiusura in poche righe — e la regia: il video diviso in scene di pochi secondi. headline è il testo della prima scena; slides resta vuoto.',
    'Ogni scena ha il titolo, cosa si vede, la durata in secondi, il testo a schermo (overlay, vuoto se non serve) e da dove arriva l’immagine (source):',
    '- «shoot»: la gira chi pubblica, col telefono. In description scrivi cosa inquadrare, da dove e con che luce, come lo diresti a lui;',
    '- «photo»: una foto vera del brand messa in movimento — zoom lento, parallasse, tendina fra un prima e un dopo;',
    '- «broll»: una clip generata dall’AI. Regge ambienti, oggetti, materiali, luce e atmosfera; quello che il brand vende invece esce alterato (un colore di capelli che vira, un piatto che cambia forma), e lì serve il vero;',
    '- «graphic»: solo grafica animata nei colori e nei font del brand — tipografia, logo, forme, un dato che cresce.',
    'Il testo a schermo sta sempre nell’overlay, mai dentro l’immagine. Sotto il video andrà la musica del brand.',
  ].join('\n'),
  article:
    'Articolo: su LinkedIn il testo lungo, con un’apertura forte e tre o quattro paragrafi; sugli altri canali un testo breve che lo presenta. headline è il titolo dell’articolo; slides e scenes restano vuoti.',
};

const SYSTEM = [
  APP_CONTEXT,
  'Qui scrivi la bozza di un contenuto: una variante di testo per ogni canale richiesto. La bozza la rilegge l’utente prima di approvarla. Il visivo non lo decidi tu: la card la disegna chi se ne occupa, dopo, guardando questo testo.',
  WRITING_RULES,
  '',
  'Regole:',
  '- segui la scheda voce alla lettera. Se «Da evitare» nomina gli esclamativi o le emoji, non usarne; se il lessico chiede i numeri in cifre, scrivi 3 e non tre; se il ritmo dice di chiudere su un fatto, chiudi su un fatto e non con un invito;',
  '- ogni canale ha la sua variante, scritta per quel canale e non copiata dalle altre;',
  '- gli hashtag stanno solo nel campo hashtags e mai nel testo: pochi e specifici, con # davanti e senza spazi (LinkedIn 3, Instagram fino a 6, Facebook 2, TikTok 4, X 2);',
  '- niente virgolette attorno al testo e nessun commento tuo fuori dal contenuto.',
].join('\n');


const writtenSchema = z.object({
  title: z.string().describe('Il titolo del contenuto in una frase.'),
  themeId: z.string().nullable().describe('L’id del tema del brand a cui si lega, o null.'),
  headline: z.string(),
  variants: z.array(z.object({ channel: channelIdSchema, text: z.string(), hashtags: z.array(z.string()) })),
  slides: z.array(
    z.object({
      title: z.string(),
      body: z.string(),
      photo: z.number().int().nullable().describe('Il numero della foto del materiale per questa slide, o null.'),
    }),
  ),
  script: z.string().describe('Lo script del video; vuoto negli altri formati.'),
  scenes: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      seconds: z.number().int(),
      source: z.enum(SCENE_SOURCES),
      overlay: z.string(),
      material: z
        .object({ file: z.number().int(), start: z.number(), end: z.number() })
        .nullable()
        .describe('Il file del materiale da cui prende l’immagine, col pezzo da usare; null se non ne usa uno.'),
    }),
  ),
});

export type ContentBasis = { kind: 'idea'; idea: Idea } | { kind: 'source'; source: IdeaSource };

export interface WriteContentInput {
  brand: Brand;
  basis: ContentBasis;
  channels: readonly ChannelId[];
  format: IdeaFormat;
  /** Quante volte la bozza è stata rifatta: da 1 in su la versione nuova deve cambiare. */
  revision: number;
  previous: Content | null;
  now: Date;
  /** I passi da far vedere a chi aspetta la bozza. */
  onSteps?: OnAiSteps;
}

export interface WrittenContent {
  title: string;
  themeId: string | null;
  format: IdeaFormat;
  variants: ChannelVariant[];
  visual: ContentVisual;
}

export function cleanHashtags(tags: readonly string[], max: number): string[] {
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const tag of tags) {
    const word = tag.replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '');
    if (!word || seen.has(word.toLowerCase())) continue;
    seen.add(word.toLowerCase());
    clean.push(`#${word}`);
    if (clean.length === max) break;
  }
  return clean;
}

function describeBasis(brand: Brand, basis: ContentBasis): string {
  if (basis.kind === 'source') {
    return [
      describeSource(basis.source),
      'Il contenuto non nasce da un’idea salvata: scegli tu il taglio, il titolo e il tema del brand più vicino.',
    ].join('\n');
  }
  const { idea } = basis;
  const theme = brand.themes.find((candidate) => candidate.id === idea.themeId);
  return [
    '## L’idea da cui nasce',
    `Titolo: ${idea.title}`,
    `Taglio: ${idea.angleLabel}. ${idea.angle}`,
    `Perché adesso: ${idea.rationale}`,
    theme ? `Tema: ${theme.name} (id "${theme.id}")` : 'Tema: nessuno',
    idea.source ? describeSource(idea.source) : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Il titolo di partenza, per il passo che dice da cosa nasce la bozza. */
function basisTitle(basis: ContentBasis): string {
  if (basis.kind === 'idea') return basis.idea.title;
  return sourceTitle(basis.source);
}

/**
 * Il materiale indicato dalla regia, riportato su un file vero: un video diventa il girato della scena, ritagliato
 * dentro la sua durata; una foto, la foto di una foto viva. Un numero che non c'è non si usa.
 */
function sceneMaterial(
  files: readonly MaterialFile[],
  pick: { file: number; start: number; end: number } | null,
): Pick<VideoScene, 'source' | 'footage' | 'trim'> | null {
  const file = pick ? files[pick.file - 1] : undefined;
  if (!pick || !file?.path || !file.catalog) return null;
  if (file.kind === 'image') return { source: 'photo', footage: { path: file.path, url: '' }, trim: null };
  const length = file.catalog.seconds ?? Math.max(pick.end, 0);
  const start = Math.min(Math.max(0, pick.start), Math.max(0, length - 0.5));
  const end = Math.min(Math.max(start + 0.5, pick.end), length || pick.end);
  return { source: 'shoot', footage: { path: file.path, url: '' }, trim: { start, end } };
}

export async function writeContent(engine: AiEngine, meta: AiMeta, input: WriteContentInput): Promise<WrittenContent> {
  const { brand, basis, channels, format, revision, previous, now, onSteps } = input;
  const source = basis.kind === 'source' ? basis.source : basis.idea.source;
  if (source?.kind === 'link') await assertPublicUrl(source.url);

  // I passi che chi aspetta vede: il profilo, da cosa parto, l'eventuale pagina letta, il testo, il visivo.
  const log = createStepLog(onSteps);
  const channelNames = channels.map(channelName).join(' e ');
  log.start('context', WRITING_STEPS.context(brand.identity.name), channelNames);
  log.finish('context');
  log.start('basis', WRITING_STEPS.basis(basisTitle(basis)));
  log.finish('basis');
  const reading = source?.kind === 'link';
  const writingLabel = WRITING_STEPS.write(channelNames);
  if (!reading) log.start('write', writingLabel);

  const result = await engine.run({
    ...meta,
    task: 'content',
    tools: reading ? ['WebFetch'] : [],
    ...(reading && { onTool: stepsFromTools(log, { first: WRITING_STEPS.plan, next: WRITING_STEPS.reflect }) }),
    schema: writtenSchema,
    system: SYSTEM,
    prompt: [
      'Scrivi la bozza del contenuto.',
      describeBasis(brand, basis),
      `## Formato\n${FORMAT_GUIDE[format]}`,
      [
        '## Canali, in quest’ordine: una variante per ciascuno',
        ...channels.map((channel) => `- "${channel}" (${channelName(channel)}): ${CHANNEL_GUIDE[channel]}`),
      ].join('\n'),
      revision > 0 && previous
        ? [
            `## Versione precedente, da non ripetere`,
            `Questa è la versione ${revision + 1}: cambia aggancio, struttura e chiusura.`,
            ...previous.variants.map((variant) => `[${variant.channel}]\n${variant.text}`),
          ].join('\n')
        : '',
      describeBrand(brand, now),
      format === 'video' && brand.visual.video ? describeVideoProfile(brand.visual.video) : '',
    ]
      .filter(Boolean)
      .join('\n\n'),
  });

  log.drop(THINKING_STEP);
  if (reading) log.start('write', writingLabel);
  log.finish('write');

  const byChannel = new Map(result.variants.map((variant) => [variant.channel, variant]));
  const variants: ChannelVariant[] = [];
  for (const channel of channels) {
    const variant = byChannel.get(channel);
    // Una variante che manca è una bozza a metà: meglio dirlo che mostrare un canale vuoto.
    if (!variant?.text.trim()) {
      throw new ApiError(502, 'AI_FAILED', 'Non sono riuscito a completare la generazione. Riprova.');
    }
    variants.push({ channel, text: variant.text.trim(), hashtags: cleanHashtags(variant.hashtags, HASHTAG_COUNT[channel]) });
  }

  const title =
    basis.kind === 'idea' ? basis.idea.title : result.title.trim() || variants[0].text.split('\n')[0].slice(0, 120);
  const themeId =
    basis.kind === 'idea'
      ? basis.idea.themeId
      : brand.themes.some((theme) => theme.id === result.themeId)
        ? result.themeId
        : null;

  const headline = result.headline.trim();
  // Il materiale di chi pubblica, quando la bozza nasce da lì: scene e slide lo citano per numero.
  const files = basis.kind === 'source' && basis.source.kind === 'material' ? basis.source.files : [];
  const photoOf = (index: number | null) => {
    const file = index ? files[index - 1] : undefined;
    return file?.kind === 'image' && file.path ? { path: file.path, url: '' } : null;
  };
  const slides =
    format === 'carousel'
      ? result.slides.slice(0, 10).map((slide) => {
          const photo = photoOf(slide.photo);
          return { title: slide.title.trim(), body: slide.body.trim(), ...(photo && { photo }) };
        })
      : [];
  const scenes =
    format === 'video'
      ? result.scenes.slice(0, 10).map((scene): VideoScene => {
          const material = sceneMaterial(files, scene.material);
          return {
            title: scene.title.trim(),
            description: scene.description.trim(),
            seconds: Math.min(60, Math.max(1, scene.seconds)),
            source: scene.source,
            overlay: scene.overlay.trim(),
            ...material,
          };
        })
      : [];
  const script = format === 'video' ? result.script.trim() : '';
  // Un carosello fatto con le foto vere ha già il suo visivo: una pagina per slide, ognuna con la sua foto.
  const photoCarousel = slides.some((slide) => slide.photo) ? photoCarouselDesign(slides, brand.visual.line) : null;

  return {
    title,
    themeId,
    format,
    variants,
    // Di solito nessun visivo: la card non nasce con la bozza. La disegna `designContentVisual` quando l'utente lo
    // chiede, guardando questo testo e le card d'esempio del brand. Il carosello fatto con le foto vere invece ce l'ha.
    visual: { headline, slides, script, scenes, design: photoCarousel },
  };
}

/** I suggerimenti pronti hanno una guida scritta; una richiesta a mano arriva al modello com'è. */
const INSTRUCTION_GUIDE: Record<string, string> = {
  'Più corto': 'accorcialo a circa metà, tenendo l’aggancio e il punto principale.',
  'Più diretto': 'togli giri di parole, premesse e formule prudenti come «forse» o «in un certo senso»: frasi attive e dirette.',
  'Aggiungi un numero':
    'aggiungi un dato concreto che rafforzi il punto. Se il numero non è nel testo o nel profilo, metti il dato tra parentesi quadre da completare.',
  'Chiudi con una domanda': 'sostituisci la chiusura con una domanda precisa al pubblico, non un generico «che ne pensate».',
  'Meno formale': 'rendi il tono più colloquiale, come parlando a un collega, senza perdere precisione.',
};

const rewriteSchema = z.object({ text: z.string() });

export async function rewriteVariant(
  engine: AiEngine,
  meta: AiMeta,
  input: {
    brand: Brand;
    content: Content;
    channel: ChannelId;
    instruction: RewriteInstruction;
    now: Date;
    onSteps?: OnAiSteps;
  },
): Promise<string> {
  const { brand, content, channel, instruction, now, onSteps } = input;
  const variant = content.variants.find((candidate) => candidate.channel === channel);
  if (!variant) throw ApiError.notFound('Il contenuto non esce su questo canale.');

  const log = createStepLog(onSteps);
  log.start('read', REWRITE_STEPS.read(channelName(channel)));
  log.finish('read');
  log.start('ask', REWRITE_STEPS.ask(instruction));
  log.finish('ask');
  log.start('write', REWRITE_STEPS.write);

  const result = await engine.run({
    ...meta,
    task: 'rewrite',
    effort: 'low',
    schema: rewriteSchema,
    system: SYSTEM,
    prompt: [
      `Riscrivi il testo per ${channelName(channel)}: ${INSTRUCTION_GUIDE[instruction] ?? instruction}`,
      `Resta nella voce del brand, sotto i ${CHANNEL_LIMITS[channel]} caratteri e senza hashtag nel testo. Rispondi con il solo testo riscritto.`,
      ['Testo:', '"""', variant.text, '"""'].join('\n'),
      describeBrand(brand, now),
    ].join('\n\n'),
  });
  const text = result.text.trim();
  if (!text) {
    log.finish('write', { failed: true });
    throw new ApiError(502, 'AI_FAILED', 'Non sono riuscito a completare la generazione. Riprova.');
  }
  log.finish('write');
  return text;
}
