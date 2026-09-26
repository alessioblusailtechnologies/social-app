import type { BrandKind, BrandLine, BrandVideo, Identity, ImageStyle, VisualExample } from '@shared/domain/brand';
import { AUDIENCES, channelName, GOALS } from '@shared/domain/catalog';
import { exampleChannels, sameReferences, templateFallback } from '@shared/domain/line';
import { aspectFor, brandKit, cleanCardText, clip, defaultLine } from '@shared/domain/visual';
import { delay, latency } from '@/lib/delay';
import { createRng, pick, sample, seedFromString } from '@shared/lib/random';
import { normalizeSite } from '@shared/lib/site';

import {
  colorsFound,
  contextStep,
  createStepLog,
  pageStep,
  pickedDetail,
  POSITIONING_STEPS,
  THINKING_STEP,
  VIDEO_PROFILE_STEPS,
  VISUAL_STEPS,
  WEBSITE_STEPS,
} from '@shared/services/ai-steps';
import type { AiService, VoiceAnalysis } from '@shared/services/types';
import { samplePhoto } from '@shared/mock/sample-images';
import { MOCK_TEMPLATE_FONTS, MOCK_TEMPLATES } from '@shared/mock/templates';

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

    async proposeVisualStyle({ identity, themes, visual, channels, restart }, onSteps) {
      const rng = createRng(seedFromString(`${identity.name}|${visual.notes ?? ''}|${visual.references?.length ?? 0}`));
      const notes = (visual.notes ?? '').toLowerCase();
      const log = createStepLog(onSteps);
      log.start('references', VISUAL_STEPS.references(visual.references?.length ?? 0), notes ? `Indicazioni: ${clip(visual.notes ?? '', 80)}` : undefined);
      await delay(latency(500, 800));
      log.finish('references');

      // Il mock non vede le immagini e non ha un direttore artistico: usa tre template fissi.
      log.start('line', VISUAL_STEPS.templates);
      await delay(latency(1200, 1800));
      const imageStyle: ImageStyle = /solo testo/.test(notes) ? 'text-only' : pick(rng, ['natural-photo', 'desaturated-photo'] as ImageStyle[]);
      const photos = imageStyle !== 'text-only';
      const names = themes.filter(Boolean).slice(0, 3).map((theme) => theme.toLowerCase());
      const refs = (visual.references ?? []).map((file) => file.path);
      const line: BrandLine = {
        ...defaultLine(identity, visual),
        templates: MOCK_TEMPLATES,
        fonts: MOCK_TEMPLATE_FONTS,
        rubrics: names.map((name) => ({ name, about: `I contenuti su ${name}.` })),
        from: refs.filter((path): path is string => Boolean(path)),
      };
      log.finish('line', { detail: MOCK_TEMPLATES.map((template) => `«${template.name}»`).join(', ') });

      // Con qualche immagine le card sono soprattutto foto, come i riferimenti tipici; senza, un misto.
      const order = (visual.references?.length ?? 0) > 0 ? ['foto-pura', 'foto-titolo', 'foto-pura'] : ['foto-titolo', 'frase', 'foto-pura'];
      // In una correzione che non parla delle foto, le foto di prima restano.
      const keep = Boolean(visual.line && notes && !restart && sameReferences(visual.line, refs) && !/foto|immagine/.test(notes));
      const kit = brandKit({ identity, visual });
      const examples: VisualExample[] = [];
      for (const [index, channel] of exampleChannels(channels).entries()) {
        const found = MOCK_TEMPLATES.find((template) => template.id === order[index % order.length]) ?? MOCK_TEMPLATES[0];
        const template = found.photo && !photos ? MOCK_TEMPLATES[2] : found;
        const aspect = aspectFor(channel, 'post');
        const description = template.photo ? `il mondo di ${identity.name || 'questo brand'}, da vicino` : '';
        const before = keep ? (visual.examples?.[index]?.photo ?? null) : null;
        // Il mock non ha un modello d'immagine: la foto è una luce finta nei colori del brand.
        const photo = template.photo ? (before ?? { path: null, url: samplePhoto(kit, `${description}|${index}`) }) : null;
        const text = cleanCardText({
          kicker: names[index % Math.max(1, names.length)] ?? '',
          headline: index === 0 ? `Ciao, siamo ${identity.name || 'noi'}` : clip(identity.pitch || 'Così lavoriamo', 80),
        });
        log.start(`card-${index}`, VISUAL_STEPS.card(channelName(channel)), `Formato ${aspect}`);
        await delay(latency(400, 700));
        examples.push({
          channel,
          aspect,
          page: { templateId: templateFallback(template), custom: template.id, text },
          file: null,
          photo,
          ...(photo && { photoDescription: description }),
        });
        log.finish(`card-${index}`);
      }
      const first = examples.find((example) => example.photo);
      line.band = first?.photo ? { description: first.photoDescription ?? '', photo: first.photo } : null;

      return {
        typography: visual.typography,
        imageStyle,
        direction: {
          summary: `Foto grandi e titoli in maiuscolo${notes ? ', come hai chiesto' : ''}.`,
          photoStyle: 'Natural daylight, soft contrast, colors that harmonize with the brand palette.',
        },
        line,
        examples,
        // Come nel backend: il profilo video nasce con la prima linea.
        ...(!visual.video && { video: mockVideoProfile(identity) }),
      };
    },

    async proposeVideoProfile({ identity }, onSteps) {
      const log = createStepLog(onSteps);
      log.start(THINKING_STEP, VIDEO_PROFILE_STEPS.thinking);
      await delay(latency(1200, 1800));
      log.drop(THINKING_STEP);
      const profile = mockVideoProfile(identity);
      log.start('done', VIDEO_PROFILE_STEPS.done, `${profile.shots.length} riprese da chiedere`);
      log.finish('done');
      return profile;
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

/** Il mock non conosce il settore: un profilo video generico, che dice quello che vale per quasi tutti. */
export function mockVideoProfile(identity: Identity): BrandVideo {
  const who = identity.name || 'il brand';
  return {
    real: `Il lavoro di ${who} e i suoi risultati: quello che si vende si mostra com'è, girato o in foto.`,
    generated: 'Il luogo vuoto prima di aprire, gli attrezzi, i materiali da vicino, la luce che entra dalla finestra.',
    shots: [
      'Le mani al lavoro, dall’alto, con la luce della finestra di lato',
      'Il risultato finito, da vicino, girandoci attorno lentamente',
      'Il luogo di lavoro la mattina, un’inquadratura ferma di 5 secondi',
      'Un dettaglio del materiale, a pochi centimetri',
    ],
    look: 'Colori naturali e caldi, un filo di grana, stacchi puliti ogni 2-3 secondi, titoli che salgono dal basso.',
    sound: 'Strumentale acustico, chitarra e percussioni leggere, intorno ai 100 bpm, luminoso e tranquillo.',
  };
}
