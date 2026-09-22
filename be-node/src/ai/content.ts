import { z } from 'zod';

import type { Brand, ChannelId } from '@/domain/brand';
import { channelName } from '@/domain/catalog';
import {
  CHANNEL_LIMITS,
  type CarouselSlide,
  type ChannelVariant,
  type Content,
  type ContentVisual,
  type RewriteInstruction,
} from '@/domain/content';
import type { Idea, IdeaFormat, IdeaSource } from '@/domain/idea';
import {
  CARD_LIMITS,
  VISUAL_KINDS,
  VISUAL_KIND_LABELS,
  type VisualDesign,
} from '@/domain/visual';

import { REWRITE_STEPS, THINKING_STEP, WRITING_STEPS, createStepLog } from '@/services/ai-steps';
import type { OnAiSteps } from '@/services/types';

import { ApiError } from '../contract/errors';
import { channelIdSchema } from '../contract/schemas';
import { assertPublicUrl } from '../lib/public-url';
import { APP_CONTEXT, WRITING_RULES, describeBrand } from './brand-context';
import type { AiEngine, AiMeta } from './engine';
import { describeSource } from './ideas';
import { stepsFromTools } from './steps';

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
  video:
    'Video breve: da 4 a 6 scene per 20-40 secondi in tutto. Per ogni scena il titolo, cosa si vede e cosa si dice, la durata in secondi e source: «shoot» se va girata da chi pubblica (persone, luoghi, mani al lavoro), «generated» se è testo a schermo o grafica. headline è il testo della prima scena; slides resta vuoto.',
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
  slides: z.array(z.object({ title: z.string(), body: z.string() })),
  scenes: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      seconds: z.number().int(),
      source: z.enum(['generated', 'shoot']),
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
  const { source } = basis;
  return source.kind === 'prompt' ? source.text : source.kind === 'link' ? source.url : source.name;
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
  const slides =
    format === 'carousel'
      ? result.slides.slice(0, 10).map((slide) => ({ title: slide.title.trim(), body: slide.body.trim() }))
      : [];
  const scenes =
    format === 'video'
      ? result.scenes.slice(0, 10).map((scene) => ({
          title: scene.title.trim(),
          description: scene.description.trim(),
          seconds: Math.min(60, Math.max(1, scene.seconds)),
          source: scene.source,
        }))
      : [];

  return {
    title,
    themeId,
    format,
    variants,
    // Nessun visivo: la card non nasce con la bozza. La disegna `designContentVisual` quando
    // l'utente lo chiede, guardando questo testo e le card d'esempio del brand.
    visual: { headline, slides, scenes, design: null },
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
