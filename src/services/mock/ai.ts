import type { BrandKind, Identity } from '@/domain/brand';
import { AUDIENCES, channelName } from '@/domain/catalog';
import { delay, latency } from '@/lib/delay';
import { createRng, pick, sample, seedFromString } from '@/lib/random';
import { normalizeSite } from '@/lib/site';

import type { AiService, VoiceAnalysis } from '../types';

/**
 * Finta AI: risposte plausibili e deterministiche (stesso input, stessa risposta),
 * con la latenza di una chiamata vera.
 */

type Group = 'person' | 'business';

const groupOf = (kind: BrandKind): Group => (kind === 'person' ? 'person' : 'business');

const THEMES: Record<Group, string[]> = {
  person: [
    'Casi reali con i numeri',
    'Errori e cosa ho imparato',
    'Il settore che cambia',
    'Dietro le quinte',
    'Assunzioni e cultura',
    'Prezzi e margini spiegati',
    'Strumenti che uso davvero',
    'Clienti e progetti',
  ],
  business: [
    'Il prodotto da vicino',
    'Clienti che raccontano',
    'Dietro le quinte',
    'Le persone del team',
    'Consigli pratici',
    'Novità e lanci',
    'Filiera e territorio',
    'Numeri e traguardi',
  ],
};

const EXTRA_AUDIENCES: Record<Group, string[]> = {
  person: ['Responsabili IT', 'Consulenti', 'Imprenditori del manifatturiero'],
  business: ['Famiglie', 'Giovani professionisti', 'Architetti e designer', 'Ristoratori'],
};

const SITE_PALETTES: [string, string, string, string][] = [
  ['#1F3A5F', '#4A6FA5', '#E9C46A', '#F7F4EE'],
  ['#264D3B', '#5C8D6A', '#E07A5F', '#F4F1E8'],
  ['#161616', '#3D3D3D', '#D7263D', '#F2F2F2'],
  ['#3A2E5C', '#7B6BA8', '#F2A65A', '#F6F3FA'],
];

const SITE_TONES = ['asciutto e tecnico', 'caldo e colloquiale', 'istituzionale', 'diretto e ironico'];

const REGISTERS: Record<Group, string[]> = {
  person: [
    'Diretto e concreto, in prima persona. Nessuna domanda retorica in apertura.',
    'Riflessivo ma pratico: parti da un episodio vissuto e arrivi a una regola.',
    'Tecnico senza gergo, prima persona plurale quando parli del team.',
  ],
  business: [
    'Caldo ma preciso, prima persona plurale. Il prodotto si racconta attraverso chi lo usa.',
    'Essenziale e rassicurante: poche promesse, molti dettagli verificabili.',
    'Colloquiale e vicino, come al banco con un cliente abituale.',
  ],
};

const RHYTHM_SHORT =
  'Frasi corte, un concetto per paragrafo, tre o quattro blocchi. Chiudi su un fatto, non su un invito.';
const RHYTHM_LONG =
  'Periodi ampi e argomentati, con un esempio concreto a metà. Chiudi riprendendo l’apertura.';

const LEXICON: Record<Group, string> = {
  person: '«in produzione», «processo», «margine», numeri sempre in cifre.',
  business: '«fatto a mano», «ogni mattina», «su misura», prezzi e quantità sempre in cifre.',
};

const AVOID_BASE = '«rivoluzionario», «game changer», «unlockare»';

const STOPWORDS = new Set([
  'abbiamo', 'allora', 'ancora', 'essere', 'invece', 'nostra', 'nostri', 'nostro', 'perché',
  'proprio', 'quando', 'quella', 'quello', 'questa', 'questo', 'sempre', 'vostro', 'qualcosa',
]);

const NUMBER_WORDS = ['zero', 'un', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci'];

function countLabel(count: number, singular: string, plural: string): string {
  return `${count <= 10 ? NUMBER_WORDS[count] : count} ${count === 1 ? singular : plural}`;
}

function frequentWords(text: string): string[] {
  const counts = new Map<string, number>();
  for (const word of text.toLowerCase().match(/[a-zàèéìòù]{7,}/g) ?? []) {
    if (!STOPWORDS.has(word)) counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, 3)
    .map(([word]) => word);
}

/** Ricava ritmo, lessico e cose da evitare dai testi incollati. */
function analyzeTexts(text: string, group: Group): Pick<VoiceAnalysis, 'rhythm' | 'lexicon' | 'avoid'> {
  const sentences = text.split(/[.!?]+\s/).filter((sentence) => sentence.trim());
  const words = text.split(/\s+/).filter(Boolean).length;
  const averageLength = words / Math.max(1, sentences.length);
  const hasEmoji = /[\uD83C-\uD83E][\uDC00-\uDFFF]/.test(text);
  const hasExclamation = text.includes('!');
  const top = frequentWords(text);

  return {
    rhythm: averageLength <= 16 ? RHYTHM_SHORT : RHYTHM_LONG,
    lexicon: top.length >= 2 ? `${top.map((word) => `«${word}»`).join(', ')}, numeri sempre in cifre.` : LEXICON[group],
    avoid: `${[AVOID_BASE, hasEmoji ? '' : 'emoji', hasExclamation ? '' : 'esclamativi'].filter(Boolean).join(', ')}.`,
  };
}

export function createMockAiService(): AiService {
  return {
    async readWebsite(site: string, identity: Identity) {
      const host = normalizeSite(site);
      const group = groupOf(identity.kind);
      const rng = createRng(seedFromString(`${host}|${group}`));
      await delay(latency(1600, 2300));
      const pages = 6 + Math.floor(rng() * 19);
      return {
        site: host,
        summary: `Ho letto ${pages} pagine di ${host}, tono ${pick(rng, SITE_TONES)}. Ho proposto temi, pubblico e una palette.`,
        themes: sample(rng, THEMES[group], 4),
        audiences: [...sample(rng, AUDIENCES[identity.kind], 2), pick(rng, EXTRA_AUDIENCES[group])],
        palette: { id: `site-${host}`, name: 'Dal sito', colors: pick(rng, SITE_PALETTES), origin: 'site' },
      };
    },

    async suggestThemes(identity: Identity) {
      const group = groupOf(identity.kind);
      const rng = createRng(seedFromString(`${identity.pitch}|${group}`));
      await delay(latency(1200, 1700));
      return sample(rng, THEMES[group], 4);
    },

    async analyzeVoice(voiceSample, identity) {
      const group = groupOf(identity.kind);
      const rng = createRng(seedFromString(`${identity.name}|${voiceSample.source}|${voiceSample.texts ?? ''}`));
      await delay(latency(1500, 2100));
      const register = pick(rng, REGISTERS[group]);

      if (voiceSample.source === 'pasted' && voiceSample.texts) {
        const count = voiceSample.texts.split(/\n\s*\n/).filter((text) => text.trim()).length;
        return {
          source: 'pasted',
          sourceLabel: countLabel(count, 'testo incollato', 'testi incollati'),
          register,
          ...analyzeTexts(voiceSample.texts, group),
        };
      }
      if (voiceSample.source === 'history') {
        const count = 18 + Math.floor(rng() * 30);
        return {
          source: 'history',
          sourceLabel: `${count} post di ${channelName(voiceSample.channel ?? 'linkedin')}`,
          register,
          rhythm: pick(rng, [RHYTHM_SHORT, RHYTHM_LONG]),
          lexicon: LEXICON[group],
          avoid: `${AVOID_BASE}, emoji, esclamativi.`,
        };
      }
      return {
        source: 'recording',
        sourceLabel: 'un minuto registrato',
        register,
        rhythm: RHYTHM_SHORT,
        lexicon: LEXICON[group],
        avoid: `${AVOID_BASE}, frasi fatte da comunicato stampa.`,
      };
    },
  };
}
