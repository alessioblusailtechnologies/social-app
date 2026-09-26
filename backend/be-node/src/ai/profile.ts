import { z } from 'zod';

import type { BrandKind, Identity } from '@shared/domain/brand';
import { PALETTE_PRESETS } from '@shared/domain/catalog';
import { normalizeSite } from '@shared/lib/site';
import {
  colorsFound,
  contextStep,
  createStepLog,
  pickedDetail,
  POSITIONING_STEPS,
  WEBSITE_STEPS,
} from '@shared/services/ai-steps';
import type { OnAiSteps, PositioningIdeas, VoiceAnalysis, VoiceSample, WebsiteInsights } from '@shared/services/types';

import { ApiError } from '../contract/errors';
import { assertPublicUrl } from '../lib/public-url';
import { APP_CONTEXT, cleanLabels, describeIdentity } from './brand-context';
import type { AiEngine, AiMeta } from './engine';
import { readSiteColors } from './site-colors';
import { stepsFromTools } from './steps';

/** Le generazioni dell'onboarding e del Profilo: lettura del sito, temi, scheda voce. */

const SYSTEM = `${APP_CONTEXT} In questo passo aiuti a compilare il profilo del brand. Scrivi in italiano semplice, senza gergo di marketing e senza trattini lunghi.`;

const THEME_RULES =
  'ogni tema è un filone su cui il brand può pubblicare con continuità, specifico del brand e non generico («Il pane di Bologna» sì, «Qualità» no), da 2 a 5 parole, con la maiuscola iniziale e senza punteggiatura';

const HEX = /^#[0-9a-f]{6}$/i;
const NUMBER_WORDS = ['zero', 'un', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci'];

function countLabel(count: number, singular: string, plural: string): string {
  return `${count <= 10 ? NUMBER_WORDS[count] : count} ${count === 1 ? singular : plural}`;
}

const websiteSchema = z.object({
  pagesRead: z.number().int().describe('Quante pagine del sito hai aperto e letto davvero; 0 se il sito non si apre.'),
  tone: z.string().describe('Il tono del sito in 2-4 parole minuscole, per esempio «caldo e colloquiale».'),
  pitch: z.string().describe('Cosa fa il brand, in una frase; vuota se il sito non si apre.'),
  themes: z.array(z.string()).describe('Esattamente 4 temi editoriali.'),
  audiences: z.array(z.string()).describe('Da 1 a 3 pubblici a cui il sito parla.'),
  palette: z.array(z.string()).describe('4 colori #RRGGBB, in ordine: principale, secondario, accento, sfondo.'),
});

/** La frase «cosa fai» scritta come la chiede il campo del profilo, con gli stessi esempi dei segnaposto. */
const PITCH_VOICE: Record<BrandKind, string> = {
  person:
    'in prima persona singolare, per esempio «Metto l’AI nei processi noiosi delle PMI italiane, partendo da dove il dolore è misurabile»',
  company:
    'in prima persona plurale, per esempio «Facciamo pane a lievitazione naturale con grani del territorio e lo consegniamo ogni mattina a bar e ristoranti»',
  client: 'in terza persona, per esempio «Progetta case piccole che sembrano grandi, con budget chiari fin dal primo incontro»',
};

function cleanPitch(text: string): string {
  const pitch = text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["«“']+|["»”']+$/g, '')
    .trim();
  return pitch.charAt(0).toUpperCase() + pitch.slice(1);
}

export async function readWebsite(
  engine: AiEngine,
  meta: AiMeta,
  site: string,
  identity: Identity,
  onSteps?: OnAiSteps,
): Promise<WebsiteInsights> {
  const log = createStepLog(onSteps);
  const host = normalizeSite(site);
  log.start('address', WEBSITE_STEPS.address, host);
  const url = await assertPublicUrl(site).catch((error: unknown) => {
    log.finish('address', { failed: true });
    throw error;
  });
  log.finish('address');
  log.start('colors', WEBSITE_STEPS.colors);
  const colors = await readSiteColors(url.toString());
  log.finish('colors', { detail: colorsFound(colors.length) });

  const result = await engine.run({
    ...meta,
    task: 'website',
    tools: ['WebFetch'],
    schema: websiteSchema,
    system: SYSTEM,
    onTool: stepsFromTools(log, { first: WEBSITE_STEPS.plan, next: WEBSITE_STEPS.reflect }),
    prompt: [
      'Leggi il sito del brand e ricava cosa fa, temi, pubblico e palette per il suo profilo.',
      '',
      describeIdentity(identity),
      `Indirizzo da aprire: ${url.toString()}`,
      '',
      'Apri la home e fino a 5 pagine interne che raccontano cosa fa (chi siamo, servizi o prodotti, casi, blog). Scrivi solo quello che hai letto: se il sito non si apre, pagesRead è 0 e proponi a partire da quello che ha scritto l’utente.',
      `- pitch: cosa fa davvero il brand, per chi e cosa lo distingue, in una frase da 12 a 30 parole ${PITCH_VOICE[identity.kind]}. Senza il nome del brand, senza slogan né superlativi, solo con quello che hai letto sul sito; se il sito non si apre, lascialo vuoto.`,
      `- themes: 4 temi in ordine di importanza, il filone principale per primo; ${THEME_RULES}.`,
      '- audiences: da 1 a 3 pubblici a cui il sito parla, da 1 a 4 parole, con la maiuscola iniziale, per esempio «Founder di PMI» o «Famiglie».',
      colors.length > 0
        ? `- palette: i colori del marchio. Nel codice del sito ho trovato, dal più usato: ${colors.join(', ')}. Scegli fra questi e scarta i grigi usati solo per il testo, a meno che il marchio sia monocromo; per lo sfondo va bene un colore molto chiaro anche se non è nell’elenco.`
        : '- palette: nel codice del sito non ho trovato colori; proponi 4 colori coerenti con il settore e il tono, con uno sfondo molto chiaro.',
    ].join('\n'),
  });

  const proposed = result.palette.filter((color) => HEX.test(color)).map((color) => color.toUpperCase());
  const fallback = PALETTE_PRESETS[0].colors;
  const palette: WebsiteInsights['palette']['colors'] = [
    proposed[0] ?? fallback[0],
    proposed[1] ?? fallback[1],
    proposed[2] ?? fallback[2],
    proposed[3] ?? fallback[3],
  ];
  const pages = Math.max(0, result.pagesRead);
  const tone = result.tone.trim().toLowerCase().replace(/[.]+$/, '');

  return {
    site: host,
    summary:
      pages > 0
        ? `Ho letto ${pages === 1 ? 'una pagina' : `${pages} pagine`} di ${host}${tone ? `, tono ${tone}` : ''}. Ho proposto temi, pubblico e una palette.`
        : `Non sono riuscito ad aprire ${host}: ho proposto temi, pubblico e una palette da quello che mi hai scritto.`,
    pitch: pages > 0 ? cleanPitch(result.pitch) : '',
    themes: cleanLabels(result.themes, 4),
    audiences: cleanLabels(result.audiences, 3),
    palette: { id: `site-${host}`, name: 'Dal sito', colors: palette, origin: 'site' },
  };
}

const themesSchema = z.object({ themes: z.array(z.string()).describe('Esattamente 4 temi editoriali.') });

export async function suggestThemes(engine: AiEngine, meta: AiMeta, identity: Identity): Promise<string[]> {
  const result = await engine.run({
    ...meta,
    task: 'themes',
    effort: 'low',
    schema: themesSchema,
    system: SYSTEM,
    prompt: [
      `Proponi 4 temi editoriali per questo brand, in ordine di importanza con il filone principale per primo: ${THEME_RULES}.`,
      '',
      describeIdentity(identity),
    ].join('\n'),
  });
  return cleanLabels(result.themes, 4);
}

const goalsSchema = z.object({
  goals: z.array(z.string()).describe('5 obiettivi, il più adatto per primo.'),
  picked: z.array(z.string()).describe('1 o 2 obiettivi presi da goals.'),
});

const audiencesSchema = z.object({
  audiences: z.array(z.string()).describe('6 pubblici, il più adatto per primo.'),
  picked: z.array(z.string()).describe('Da 1 a 3 pubblici presi da audiences.'),
});

const GOAL_EXAMPLES: Record<BrandKind, string> = {
  person: '«Trovare clienti tra le PMI», «Farmi conoscere nel settore», «Attirare sviluppatori nel team»',
  company: '«Portare clienti in negozio», «Trovare nuovi rivenditori», «Far conoscere il marchio in città»',
  client: '«Portare clienti in studio», «Trovare nuovi rivenditori», «Far conoscere il marchio in città»',
};

/** Solo le scelte che stanno fra le proposte, scritte come le proposte; almeno la prima. */
function pickFrom(picked: readonly string[], options: readonly string[], max: number): string[] {
  const chosen = cleanLabels(picked, max).flatMap((label) => {
    const match = options.find((option) => option.toLowerCase() === label.toLowerCase());
    return match ? [match] : [];
  });
  return chosen.length > 0 ? chosen : options.slice(0, 1);
}

export interface SiteContext {
  site: string;
  summary: string;
  pitch: string;
  themes: string[];
  audiences: string[];
}

/**
 * Obiettivi e pubblico in due tempi, uno dopo l'altro: prima perché pubblica, poi per chi, sapendo gli
 * obiettivi scelti. Ogni tempo è un passo che l'utente vede.
 */
export async function suggestPositioning(
  engine: AiEngine,
  meta: AiMeta,
  identity: Identity,
  site: SiteContext | null,
  onSteps?: OnAiSteps,
): Promise<PositioningIdeas> {
  const log = createStepLog(onSteps);
  const labels = POSITIONING_STEPS[identity.kind];
  const start = contextStep(site?.site ?? null, site?.pitch || identity.pitch);
  log.start('context', start.label, start.detail);
  const context = [
    describeIdentity(identity),
    ...(site
      ? [
          '',
          `Dalla lettura del sito ${site.site}:`,
          site.pitch ? `- cosa fa: ${site.pitch}` : '',
          `- ${site.summary}`,
          `- temi: ${site.themes.join(', ')}`,
          `- pubblici a cui parla: ${site.audiences.join(', ')}`,
        ].filter(Boolean)
      : []),
  ].join('\n');
  log.finish('context');

  log.start('goals', labels.goals);
  const goalsResult = await engine.run({
    ...meta,
    task: 'positioning',
    effort: 'low',
    schema: goalsSchema,
    system: SYSTEM,
    prompt: [
      'Proponi perché questo brand pubblica sui social, per il suo profilo.',
      '',
      context,
      '',
      `- goals: 5 obiettivi concreti per cui pubblica, da 2 a 5 parole, con la maiuscola iniziale e senza punteggiatura, specifici del brand e non generici, per esempio ${GOAL_EXAMPLES[identity.kind]}.`,
      '- picked: 1 o 2 obiettivi presi da goals e scritti uguali: quelli che sceglieresti per questo brand.',
      'Usa solo quello che sai del brand: non inventare mercati di cui non c’è traccia.',
    ].join('\n'),
  });
  const goals = cleanLabels(goalsResult.goals, 6);
  const pickedGoals = pickFrom(goalsResult.picked, goals, 2);
  log.finish('goals', { detail: pickedDetail(goals.length, pickedGoals) });

  log.start('audiences', labels.audiences);
  const audiencesResult = await engine.run({
    ...meta,
    task: 'positioning',
    effort: 'low',
    schema: audiencesSchema,
    system: SYSTEM,
    prompt: [
      'Proponi chi vuole raggiungere questo brand sui social, per il suo profilo.',
      '',
      context,
      `Obiettivi scelti: ${pickedGoals.join(', ')}`,
      '',
      '- audiences: 6 pubblici che vuole raggiungere per quegli obiettivi, da 1 a 4 parole, con la maiuscola iniziale, specifici (chi compra, chi decide, chi consiglia), per esempio «Ristoratori di Bologna» o «Founder di PMI».',
      '- picked: da 1 a 3 pubblici presi da audiences e scritti uguali: quelli che sceglieresti per questo brand.',
      'Usa solo quello che sai del brand: non inventare pubblici di cui non c’è traccia.',
    ].join('\n'),
  });
  const audiences = cleanLabels(audiencesResult.audiences, 6);
  const pickedAudiences = pickFrom(audiencesResult.picked, audiences, 3);
  log.finish('audiences', { detail: pickedDetail(audiences.length, pickedAudiences) });

  return { goals, audiences, picked: { goals: pickedGoals, audiences: pickedAudiences } };
}

/**
 * Le parole chiave che il controllo di coerenza del FE (`checkVoice`) e le bozze leggono
 * nella scheda: se l'AI le scrive diversamente, il controllo non le vede.
 */
const VOICE_CARD_RULES = [
  'La scheda voce ha quattro campi, di una o due frasi ciascuno:',
  '- register: il registro, cioè persona grammaticale, formalità e tono, per esempio «Diretto e concreto, in prima persona. Nessuna domanda retorica in apertura.»;',
  '- rhythm: il ritmo. Se le frasi sono per lo più brevi scrivi «Frasi corte»; se i testi chiudono su un dato o un fatto aggiungi «Chiudi su un fatto, non su un invito»;',
  '- lexicon: il lessico ammesso, con le parole e le espressioni tipiche tra caporali «così», e «numeri sempre in cifre» se nei testi i numeri sono in cifre;',
  '- avoid: cosa evitare, con le parole tra caporali «così»; aggiungi «emoji» se nei testi non ce ne sono e «esclamativi» se non ci sono punti esclamativi.',
  'Queste parole chiave le legge un controllo automatico: quando valgono, usale esattamente così. Descrivi la voce dei testi, non come dovrebbe essere.',
].join('\n');

const voiceSchema = z.object({
  register: z.string(),
  rhythm: z.string(),
  lexicon: z.string(),
  avoid: z.string(),
});

export async function analyzeVoice(engine: AiEngine, meta: AiMeta, sample: VoiceSample, identity: Identity): Promise<VoiceAnalysis> {
  if (sample.source === 'history') {
    throw ApiError.notAvailable(
      'Leggere lo storico di un canale richiede il collegamento vero del canale, che non c’è ancora. Per ora incolla qualche testo.',
    );
  }
  if (sample.source === 'recording') {
    throw ApiError.notAvailable('La registrazione della voce non è ancora disponibile. Per ora incolla qualche testo.');
  }
  const texts = sample.texts?.trim() ?? '';
  if (texts.length < 40) throw ApiError.invalid('Incolla almeno qualche riga scritta da te.');
  const count = texts.split(/\n\s*\n/).filter((text) => text.trim()).length;

  const card = await engine.run({
    ...meta,
    task: 'voice',
    schema: voiceSchema,
    system: SYSTEM,
    prompt: [
      'Leggi i testi scritti dal brand e compila la sua scheda voce.',
      '',
      describeIdentity(identity),
      '',
      VOICE_CARD_RULES,
      '',
      `Testi (${count}), separati da una riga vuota:`,
      '"""',
      texts,
      '"""',
    ].join('\n'),
  });

  return {
    source: 'pasted',
    sourceLabel: countLabel(count, 'testo incollato', 'testi incollati'),
    register: card.register.trim(),
    rhythm: card.rhythm.trim(),
    lexicon: card.lexicon.trim(),
    avoid: card.avoid.trim(),
  };
}
