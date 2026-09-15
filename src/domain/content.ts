import type { ChannelId, VoiceCard } from './brand';
import type { IdeaFormat } from './idea';

/**
 * Il contenuto di un'uscita: la bozza che l'AI prepara a partire dall'idea, con una
 * variante di testo per ogni canale e il visivo adatto al formato. Si ritocca e si approva.
 */

export interface ChannelVariant {
  channel: ChannelId;
  text: string;
  hashtags: string[];
}

export interface CarouselSlide {
  title: string;
  body: string;
}

export interface VideoScene {
  title: string;
  description: string;
  seconds: number;
  /** L'AI la genera oppure va girata da chi pubblica. */
  source: 'generated' | 'shoot';
}

export interface ContentVisual {
  /** Titolo della copertina o della prima slide. */
  headline: string;
  slides: CarouselSlide[];
  scenes: VideoScene[];
}

export type ContentStatus = 'draft' | 'approved';

export interface Content {
  id: string;
  brandId: string;
  slotId: string;
  ideaId: string;
  format: IdeaFormat;
  variants: ChannelVariant[];
  visual: ContentVisual;
  status: ContentStatus;
  /** Quante volte la bozza è stata rifatta da capo. */
  revision: number;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
}

export const REWRITE_INSTRUCTIONS = [
  'Più corto',
  'Più diretto',
  'Aggiungi un numero',
  'Chiudi con una domanda',
  'Meno formale',
] as const;

export type RewriteInstruction = (typeof REWRITE_INSTRUCTIONS)[number];

export const CHANNEL_LIMITS: Record<ChannelId, number> = {
  linkedin: 3000,
  instagram: 2200,
  facebook: 5000,
  tiktok: 2200,
  x: 280,
};

// "sei" resta fuori: in italiano è anche un verbo.
const NUMBER_WORDS: Record<string, string> = {
  due: '2',
  tre: '3',
  quattro: '4',
  cinque: '5',
  sette: '7',
  otto: '8',
  nove: '9',
  dieci: '10',
};

const NUMBER_PATTERN = new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join('|')})\\b`, 'gi');

/** "Tre numeri" → "3 numeri", come chiede una voce che scrive i numeri in cifre. */
export function numbersToDigits(text: string): string {
  return text.replace(NUMBER_PATTERN, (word) => NUMBER_WORDS[word.toLowerCase()]);
}

/** Le parole tra «» di un campo della scheda voce. */
export function quotedWords(text: string): string[] {
  return [...text.matchAll(/«([^»]+)»/g)].map((match) => match[1].toLowerCase());
}

export interface VoiceNote {
  ok: boolean;
  text: string;
}

export interface VoiceCheck {
  score: number;
  notes: VoiceNote[];
}

function averageSentenceLength(text: string): number {
  const body = text.replace(/#\S+/g, ' ');
  const sentences = body.split(/[.!?\n]+/).filter((sentence) => sentence.trim().split(/\s+/).length > 1);
  const words = sentences.reduce((sum, sentence) => sum + sentence.trim().split(/\s+/).length, 0);
  return sentences.length > 0 ? words / sentences.length : 0;
}

/**
 * Controllo di coerenza con la scheda voce, fatto con regole semplici sul testo:
 * si ricalcola a ogni modifica, anche su quello che scrive l'utente.
 */
export function checkVoice(text: string, card: VoiceCard | null, limit?: number): VoiceCheck {
  if (!card) {
    return {
      score: 70,
      notes: [{ ok: false, text: 'Manca la scheda voce: completala nel Profilo per un controllo preciso.' }],
    };
  }

  const lower = text.toLowerCase();
  const notes: VoiceNote[] = [];

  const avoided = quotedWords(card.avoid).filter((word) => lower.includes(word));
  notes.push(
    avoided.length > 0
      ? { ok: false, text: `Contiene parole da evitare: ${avoided.map((word) => `«${word}»`).join(', ')}.` }
      : { ok: true, text: 'Nessuna parola della lista da evitare.' },
  );

  if (/esclamativ/i.test(card.avoid)) {
    notes.push(
      text.includes('!')
        ? { ok: false, text: 'Ci sono punti esclamativi, che la tua voce evita.' }
        : { ok: true, text: 'Nessun punto esclamativo.' },
    );
  }

  if (/emoji/i.test(card.avoid) && /[\uD83C-\uD83E][\uDC00-\uDFFF]/.test(text)) {
    notes.push({ ok: false, text: 'Ci sono emoji, che la tua voce evita.' });
  }

  if (/frasi corte/i.test(card.rhythm)) {
    const average = averageSentenceLength(text);
    notes.push(
      average <= 18
        ? { ok: true, text: 'Frasi corte, come nella scheda voce.' }
        : { ok: false, text: `Frasi lunghe, in media ${Math.round(average)} parole: la tua voce le preferisce corte.` },
    );
  }

  if (/in cifre/i.test(card.lexicon) && NUMBER_PATTERN.test(text)) {
    notes.push({ ok: false, text: 'Alcuni numeri sono scritti in lettere: la tua voce li vuole in cifre.' });
  }
  NUMBER_PATTERN.lastIndex = 0;

  const lexicon = quotedWords(card.lexicon).filter((word) => lower.includes(word));
  if (lexicon.length > 0) {
    notes.push({ ok: true, text: `Usa il tuo lessico: ${lexicon.map((word) => `«${word}»`).join(', ')}.` });
  }

  if (limit !== undefined && text.length > limit) {
    notes.push({ ok: false, text: `Supera il limite di ${limit} caratteri del canale.` });
  }

  const warnings = notes.filter((note) => !note.ok).length;
  return { score: Math.max(40, 100 - warnings * 15 - (lexicon.length > 0 ? 0 : 4)), notes };
}
