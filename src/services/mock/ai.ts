import type { BrandKind, Identity, ImageStyle, TypographyId, VisualExample } from '@/domain/brand';
import {
  AUDIENCES,
  channelName,
  GOALS,
  IMAGE_STYLES,
  imageStyleLabel,
  TYPOGRAPHY_OPTIONS,
  typographyName,
} from '@/domain/catalog';
import {
  aspectFor,
  chooseTemplate,
  clip,
  emptyCardText,
  EXAMPLE_TEMPLATES,
  type CardText,
  type TemplateId,
} from '@/domain/visual';
import { delay, latency } from '@/lib/delay';
import { createRng, pick, sample, seedFromString } from '@/lib/random';
import { normalizeSite } from '@/lib/site';

import {
  colorsFound,
  contextStep,
  createStepLog,
  pageStep,
  pickedDetail,
  POSITIONING_STEPS,
  THINKING_STEP,
  VISUAL_STEPS,
  WEBSITE_STEPS,
} from '../ai-steps';
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

const SITE_PAGES = ['chi-siamo', 'servizi', 'progetti', 'blog', 'prodotti', 'team', 'casi-studio'];

/** La frase «cosa fai» come la scriverebbe l'AI: con la persona grammaticale del campo. */
const PITCHES: Record<BrandKind, string[]> = {
  person: [
    'Aiuto le piccole imprese a mettere ordine nei processi, partendo da quello che fa perdere più tempo ogni settimana',
    'Affianco founder e team di prodotto nelle scelte difficili, con i numeri alla mano e senza giri di parole',
    'Porto dati e automazioni nelle aziende che lavorano ancora a mano, un processo alla volta',
  ],
  company: [
    'Facciamo pochi prodotti e li facciamo bene, con materie prime del territorio e prezzi chiari per chi compra ogni giorno',
    'Progettiamo e installiamo impianti su misura per case e negozi, con un solo referente dal sopralluogo alla manutenzione',
    'Cuciniamo ricette di famiglia con ingredienti di stagione, a pranzo per chi lavora e la sera per chi vuole fermarsi',
  ],
  client: [
    'Progetta spazi di lavoro piccoli che funzionano, con tempi e costi chiari fin dal primo incontro',
    'Segue le famiglie nella scelta della casa, dalla prima visita al rogito, senza sorprese sui costi',
    'Produce arredi su misura in legno massello per case e locali, con consegna e montaggio inclusi',
  ],
};

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

/** I testi delle card di esempio del mock, dai temi e dalla frase su cosa fa il brand. */
function exampleText(templateId: TemplateId, identity: Identity, themes: readonly string[], index: number): CardText {
  const theme = themes[index % Math.max(1, themes.length)] ?? identity.name;
  const text = { ...emptyCardText(), kicker: theme };
  switch (templateId) {
    case 'stat':
      return { ...text, value: '[3 ore]', headline: 'risparmiate ogni settimana quando il lavoro ha un metodo' };
    case 'list':
      return {
        ...text,
        headline: 'Tre cose che non cambiamo mai',
        items: (themes.length >= 3 ? themes.slice(0, 3) : ['Ascoltare prima', 'Dire i numeri', 'Mantenere le promesse']).map(
          (title) => ({ title, body: '' }),
        ),
      };
    case 'steps':
      return {
        ...text,
        headline: 'Come lavoriamo, in tre passi',
        items: [
          { title: 'Ascoltiamo', body: 'Partiamo da quello che ti serve davvero.' },
          { title: 'Proponiamo', body: 'Una soluzione chiara, con tempi e costi.' },
          { title: 'Consegniamo', body: 'E restiamo lì anche dopo.' },
        ],
      };
    default:
      return { ...text, headline: clip(identity.pitch || `Così lavora ${identity.name || 'il brand'}`, 90) };
  }
}

export function createMockAiService(): AiService {
  return {
    async readWebsite(site: string, identity: Identity, onSteps) {
      const host = normalizeSite(site);
      const group = groupOf(identity.kind);
      const rng = createRng(seedFromString(`${host}|${group}`));
      const pages = [`https://${host}/`, ...sample(rng, SITE_PAGES, 2).map((page) => `https://${host}/${page}`)];

      // Gli stessi passi della lettura vera, con i tempi di una lettura corta.
      const log = createStepLog(onSteps);
      log.start('address', WEBSITE_STEPS.address, host);
      await delay(latency(300, 500));
      log.finish('address');
      log.start('colors', WEBSITE_STEPS.colors);
      await delay(latency(500, 800));
      log.finish('colors', { detail: colorsFound(3 + Math.floor(rng() * 5)) });
      log.start(THINKING_STEP, WEBSITE_STEPS.plan);
      await delay(latency(600, 900));
      for (const url of pages) {
        log.drop(THINKING_STEP);
        const { label, detail } = pageStep(url);
        log.start(url, label, detail);
        await delay(latency(700, 1100));
        log.finish(url);
        log.start(THINKING_STEP, WEBSITE_STEPS.reflect);
        await delay(latency(400, 700));
      }

      return {
        site: host,
        summary: `Ho letto ${pages.length} pagine di ${host}, tono ${pick(rng, SITE_TONES)}. Ho proposto temi, pubblico e una palette.`,
        pitch: pick(rng, PITCHES[identity.kind]),
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

    async suggestPositioning(identity, site, onSteps) {
      const group = groupOf(identity.kind);
      const rng = createRng(seedFromString(`${identity.pitch}|${site?.site ?? ''}|${identity.kind}`));
      const log = createStepLog(onSteps);
      const labels = POSITIONING_STEPS[identity.kind];
      const start = contextStep(site?.site ?? null, site?.pitch || identity.pitch);
      log.start('context', start.label, start.detail);
      await delay(latency(300, 500));
      log.finish('context');

      log.start('goals', labels.goals);
      await delay(latency(900, 1300));
      const goals = sample(rng, GOALS[identity.kind], 5);
      log.finish('goals', { detail: pickedDetail(goals.length, goals.slice(0, 2)) });

      log.start('audiences', labels.audiences);
      await delay(latency(900, 1300));
      const audiences = [
        ...new Set([...(site?.audiences ?? []), ...sample(rng, [...AUDIENCES[identity.kind], ...EXTRA_AUDIENCES[group]], 6)]),
      ].slice(0, 6);
      log.finish('audiences', { detail: pickedDetail(audiences.length, audiences.slice(0, 2)) });

      return { goals, audiences, picked: { goals: goals.slice(0, 2), audiences: audiences.slice(0, 2) } };
    },

    async proposeVisualStyle({ identity, themes, visual, channels }, onSteps) {
      const rng = createRng(seedFromString(`${identity.name}|${visual.notes ?? ''}|${visual.references?.length ?? 0}`));
      const notes = (visual.notes ?? '').toLowerCase();
      const log = createStepLog(onSteps);
      log.start('references', VISUAL_STEPS.references(visual.references?.length ?? 0), notes ? `Indicazioni: ${clip(visual.notes ?? '', 80)}` : undefined);
      await delay(latency(500, 800));
      log.finish('references');

      log.start('style', VISUAL_STEPS.style);
      await delay(latency(900, 1300));
      // Il mock non vede le immagini: legge solo qualche parola delle indicazioni.
      const typography: TypographyId = /grazie|serif|elegan|classic/.test(notes)
        ? 'fraunces'
        : /tecnic|tech/.test(notes)
          ? 'space-grotesk'
          : /morbid|rotond/.test(notes)
            ? 'manrope'
            : pick(rng, TYPOGRAPHY_OPTIONS).id;
      const imageStyle: ImageStyle = /minimal|pulit|solo testo/.test(notes)
        ? 'text-only'
        : /geometr|forme/.test(notes)
          ? 'flat-geometric'
          : pick(rng, IMAGE_STYLES).id;
      log.finish('style', { detail: `Caratteri «${typographyName(typography)}» · ${imageStyleLabel(imageStyle).toLowerCase()}` });

      const examples: VisualExample[] = [];
      for (const [index, channel] of channels.slice(0, 5).entries()) {
        const aspect = aspectFor(channel, 'post');
        const preferred = EXAMPLE_TEMPLATES[index % EXAMPLE_TEMPLATES.length];
        const text = exampleText(preferred, identity, themes, index);
        log.start(`card-${channel}`, VISUAL_STEPS.card(channelName(channel)), `Formato ${aspect}`);
        await delay(latency(400, 700));
        examples.push({ channel, aspect, page: { templateId: chooseTemplate('infographic', text, preferred), text }, file: null });
        log.finish(`card-${channel}`);
      }

      return {
        typography,
        imageStyle,
        direction: {
          summary: `Caratteri ${typographyName(typography).toLowerCase()} e ${imageStyleLabel(imageStyle).toLowerCase()}${notes ? ', come hai chiesto' : ''}.`,
          photoStyle: 'Natural daylight, soft contrast, colors that harmonize with the brand palette.',
        },
        examples,
      };
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
