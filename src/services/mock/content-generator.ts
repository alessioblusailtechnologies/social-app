import type { Brand, ChannelId, ImageStyle } from '@/domain/brand';
import { currentVoiceCard } from '@/domain/brand';
import { withBrandTemplates } from '@/domain/line';
import { proposeDesign, type VisualKind, type VisualProposal } from '@/domain/visual';
import {
  CHANNEL_LIMITS,
  numbersToDigits,
  type CarouselSlide,
  type ChannelVariant,
  type ContentVisual,
  type RewriteInstruction,
  type VideoScene,
} from '@/domain/content';
import type { Idea, IdeaFormat, IdeaSource } from '@/domain/idea';
import { createRng, pick, seedFromString } from '@/lib/random';

import { draftsFromSource } from './idea-generator';

/**
 * Finta AI dei contenuti: dall'idea scrive una variante per canale e il visivo del formato,
 * seguendo le regole più semplici della scheda voce (niente esclamativi, numeri in cifre).
 */

type Rng = () => number;

const HASHTAG_COUNT: Record<ChannelId, number> = { linkedin: 3, instagram: 6, facebook: 2, tiktok: 4, x: 2 };

const STOPWORDS = new Set(['della', 'delle', 'degli', 'dello', 'nella', 'nelle', 'sulla', 'come', 'dietro', 'quinte']);

const GENERIC_TAGS: Record<'person' | 'business', string[]> = {
  person: ['#Imprenditoria', '#PMI', '#Lavoro', '#Innovazione', '#Founder'],
  business: ['#PiccoleImprese', '#MadeInItaly', '#Artigianato', '#Qualità', '#Territorio'],
};

const BRIDGES: Record<'person' | 'business', string[]> = {
  person: [
    'Non è una questione di strumenti: è una questione di abitudini.',
    'Il dettaglio che fa la differenza è quasi sempre il più noioso.',
    'Detto semplice: meno passaggi, meno errori, più tempo per il lavoro vero.',
  ],
  business: [
    'Dietro c’è il lavoro di tutto il team, ogni giorno.',
    'Lo facciamo così perché i clienti se ne accorgono.',
    'Il dettaglio che fa la differenza è quasi sempre il più nascosto.',
  ],
};

const FACT_CLOSINGS = [
  'Oggi è il modo in cui lavoriamo, non un esperimento.',
  'Il risultato si vede nel calendario, non nelle slide.',
  'È cambiato poco nel metodo e molto nel tempo che ci resta.',
];

const INVITE_CLOSINGS: Record<'person' | 'business', string> = {
  person: 'Se ti ritrovi in questa situazione, scrivimi.',
  business: 'Se vi ritrovate in questa situazione, scriveteci.',
};

const QUESTION_CLOSINGS = ['E da voi come funziona?', 'Vi è mai capitato?', 'Voi come lo gestite?'];

const HEDGES = /\b(forse|probabilmente|in un certo senso|diciamo che|credo che|un po['’])\s*/gi;

const INFORMAL: [RegExp, string][] = [
  [/\bTuttavia\b/g, 'Però'],
  [/\btuttavia\b/g, 'però'],
  [/\bPertanto\b/g, 'Quindi'],
  [/\bpertanto\b/g, 'quindi'],
  [/\bInoltre\b/g, 'E poi'],
  [/\binoltre\b/g, 'e poi'],
  [/\bal fine di\b/gi, 'per'],
  [/\bQualora\b/g, 'Se'],
  [/\bqualora\b/g, 'se'],
];

function sentencesOf(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]*/g) ?? []).map((sentence) => sentence.trim()).filter(Boolean);
}

function withPeriod(text: string): string {
  return /[.!?…]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;
}

/** Titolo breve per slide e copertine: fino ai due punti, o alle prime parole. */
function shortHook(title: string): string {
  const beforeColon = title.split(':')[0].trim();
  if (beforeColon.length <= 64) return beforeColon;
  return `${beforeColon.slice(0, beforeColon.lastIndexOf(' ', 60))}…`;
}

// Niente String.normalize: su Hermes non è garantito.
const ACCENTS: [RegExp, string][] = [
  [/[àá]/g, 'a'],
  [/[èé]/g, 'e'],
  [/[ìí]/g, 'i'],
  [/[òó]/g, 'o'],
  [/[ùú]/g, 'u'],
];

function camelTag(text: string): string {
  const words = ACCENTS.reduce((current, [pattern, letter]) => current.replace(pattern, letter), text)
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word.toLowerCase()))
    .slice(0, 2);
  return words.length > 0 ? `#${words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join('')}` : '';
}

function hashtagsFor(brand: Brand, idea: Idea, channel: ChannelId): string[] {
  const group = brand.identity.kind === 'person' ? 'person' : 'business';
  const theme = brand.themes.find((candidate) => candidate.id === idea.themeId);
  const tags = [
    theme ? camelTag(theme.name) : '',
    camelTag(brand.identity.company || brand.identity.name),
    brand.identity.sector ? camelTag(brand.identity.sector) : '',
    ...GENERIC_TAGS[group],
  ].filter(Boolean);
  return [...new Set(tags)].slice(0, HASHTAG_COUNT[channel]);
}

export interface GeneratedContent {
  format: IdeaFormat;
  variants: ChannelVariant[];
  visual: ContentVisual;
}

const KIND_BY_STYLE: Record<ImageStyle, VisualKind> = {
  'flat-geometric': 'infographic',
  'text-only': 'infographic',
  'natural-photo': 'photo',
  'desaturated-photo': 'mixed',
};

const VALUE_PATTERN = /\b\d+(?:[.,]\d+)?\s?(?:%|ore|giorni|minuti|settimane|mesi|anni|euro|€)/i;

/** La proposta di visivo: il tipo dallo stile del brand, i testi della card dall'idea, la foto descritta a parole. */
function visualProposal(brand: Brand, idea: Idea, angle: string[], clean: (text: string) => string): VisualProposal {
  const theme = brand.themes.find((candidate) => candidate.id === idea.themeId);
  return {
    kind: KIND_BY_STYLE[brand.visual.imageStyle],
    templateId: null,
    text: {
      kicker: theme?.name ?? idea.angleLabel,
      headline: clean(shortHook(idea.title)),
      body: clean(angle[0] ?? ''),
      value: VALUE_PATTERN.exec(clean(`${idea.title} ${idea.angle}`))?.[0] ?? '',
      items: angle.length >= 3 ? angle.slice(0, 4).map((sentence) => ({ title: '', body: clean(sentence).replace(/\.$/, '') })) : [],
      author: '',
    },
    imageDescription:
      brand.identity.kind === 'person'
        ? 'Una scrivania ordinata con un portatile aperto, un taccuino e una tazza, luce naturale da una finestra laterale'
        : 'Mani al lavoro su un banco ordinato, inquadratura ravvicinata, luce naturale morbida',
  };
}

export function generateContent(
  brand: Brand,
  idea: Idea,
  channels: ChannelId[],
  format: IdeaFormat,
  revision: number,
): GeneratedContent {
  const rng: Rng = createRng(seedFromString(`${idea.id}|${revision}|${format}`));
  const group = brand.identity.kind === 'person' ? 'person' : 'business';
  const card = currentVoiceCard(brand.voice);
  const digits = card ? /in cifre/i.test(card.lexicon) : false;
  const closeOnFact = card ? /chiudi su un fatto/i.test(card.rhythm) : false;
  const clean = (text: string) => {
    const noExclamations = text.replace(/!/g, '.');
    return digits ? numbersToDigits(noExclamations) : noExclamations;
  };

  const hook = withPeriod(idea.title);
  const angle = sentencesOf(idea.angle);
  const bridge = pick(rng, BRIDGES[group]);
  const closing = closeOnFact ? pick(rng, FACT_CLOSINGS) : INVITE_CLOSINGS[group];
  const cta =
    format === 'carousel'
      ? 'Scorri le slide.'
      : format === 'video'
        ? 'Guarda fino alla fine.'
        : 'Salvalo per quando ti servirà.';

  const textFor = (channel: ChannelId): string => {
    switch (channel) {
      case 'linkedin':
        return [hook, angle.slice(0, 3).join(' '), bridge, closing].join('\n\n');
      case 'facebook':
        return [hook, angle.slice(0, 3).join(' '), closing].join('\n\n');
      case 'instagram':
        return [hook, angle.slice(0, 2).join('\n'), cta].join('\n\n');
      case 'tiktok':
        return [shortHook(idea.title), cta].join('\n\n');
      case 'x': {
        const text = [hook, angle[0] ?? ''].filter(Boolean).join(' ');
        return text.length <= CHANNEL_LIMITS.x - 30 ? text : hook;
      }
    }
  };

  const variants = channels.map((channel) => ({
    channel,
    text: clean(textFor(channel)),
    hashtags: hashtagsFor(brand, idea, channel),
  }));

  const slides: CarouselSlide[] =
    format === 'carousel'
      ? [
          { title: shortHook(idea.title), body: idea.angleLabel },
          ...angle.slice(0, 3).map((sentence, i) => ({ title: `${i + 1}`, body: sentence })),
          { title: 'In breve', body: bridge },
          { title: brand.identity.company || brand.identity.name, body: 'Salva il carosello e giralo a chi ne ha bisogno.' },
        ].map((slide) => ({ title: clean(slide.title), body: clean(slide.body) }))
      : [];

  const scenes: VideoScene[] =
    format === 'video'
      ? [
          { title: 'Aggancio', description: `Testo a schermo: «${shortHook(idea.title)}»`, seconds: 3, source: 'generated' as const },
          {
            title: 'Contesto',
            description: 'Inquadra il luogo di lavoro o le mani al lavoro, senza parlare.',
            seconds: 5,
            source: 'shoot' as const,
          },
          {
            title: 'Il punto',
            description: `A voce, guardando in camera: ${angle[0] ?? idea.angle}`,
            seconds: 8,
            source: 'shoot' as const,
          },
          { title: 'La prova', description: 'Grafica con il dato chiave e il logo piccolo in basso.', seconds: 5, source: 'generated' as const },
          { title: 'Chiusura', description: closing, seconds: 3, source: 'generated' as const },
        ].map((scene) => ({ ...scene, description: clean(scene.description) }))
      : [];

  // Nessun visivo con la bozza: la card si disegna dopo, come nel backend vero.
  return { format, variants, visual: { headline: clean(shortHook(idea.title)), slides, scenes, design: null } };
}

/**
 * Contenuto creato direttamente da una fonte, senza idea salvata: l'AI sceglie un taglio
 * (diverso a ogni revisione), lo lega al tema più vicino e scrive la bozza.
 */
export function generateDirectContent(
  brand: Brand,
  source: IdeaSource,
  channels: ChannelId[],
  format: IdeaFormat,
  revision: number,
  contentId: string,
): GeneratedContent & { title: string; themeId: string | null } {
  const [draft] = draftsFromSource(brand, source, revision);
  const basis: Idea = {
    ...draft,
    id: contentId,
    brandId: brand.id,
    createdAt: '',
    status: 'saved',
    decidedAt: null,
    formats: [format],
  };
  return {
    ...generateContent(brand, basis, channels, format, revision),
    title: draft.title,
    themeId: draft.themeId,
  };
}

/** Riscrittura veloce di un testo secondo un'istruzione. */
export function rewriteText(text: string, instruction: RewriteInstruction, seed: string): string {
  const rng = createRng(seedFromString(`${seed}|${instruction}`));
  let paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  switch (instruction) {
    case 'Più corto':
      paragraphs =
        paragraphs.length > 2
          ? [paragraphs[0], paragraphs[paragraphs.length - 1]]
          : paragraphs.map((paragraph) => sentencesOf(paragraph)[0] ?? paragraph);
      break;
    case 'Più diretto':
      paragraphs = paragraphs
        .map((paragraph) => paragraph.replace(HEDGES, '').replace(/\s{2,}/g, ' ').trim())
        .filter((paragraph) => paragraph && !paragraph.endsWith('?'));
      break;
    case 'Aggiungi un numero': {
      const share = 20 + Math.floor(rng() * 50);
      paragraphs.splice(Math.min(1, paragraphs.length), 0, `Un dato per capirci: il ${share}% del tempo se ne andava proprio lì.`);
      break;
    }
    case 'Chiudi con una domanda': {
      const question = pick(rng, QUESTION_CLOSINGS);
      paragraphs = paragraphs.length > 1 ? [...paragraphs.slice(0, -1), question] : [...paragraphs, question];
      break;
    }
    case 'Meno formale':
      paragraphs = paragraphs.map((paragraph) =>
        INFORMAL.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), paragraph),
      );
      break;
    // Una richiesta scritta a mano: qui nel finto non si capisce cosa chiede, si ripulisce e basta.
    default:
      paragraphs = paragraphs.map((paragraph) => paragraph.replace(HEDGES, '').replace(/\s{2,}/g, ' ').trim());
      break;
  }

  return paragraphs.join('\n\n');
}
