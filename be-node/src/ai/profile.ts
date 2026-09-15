import { z } from 'zod';

import type { Identity } from '@/domain/brand';
import { PALETTE_PRESETS } from '@/domain/catalog';
import { normalizeSite } from '@/lib/site';
import type { VoiceAnalysis, VoiceSample, WebsiteInsights } from '@/services/types';

import { ApiError } from '../contract/errors';
import { assertPublicUrl } from '../lib/public-url';
import { APP_CONTEXT, cleanLabels, describeIdentity } from './brand-context';
import type { AiEngine, AiMeta } from './engine';
import { readSiteColors } from './site-colors';

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
  themes: z.array(z.string()).describe('Esattamente 4 temi editoriali.'),
  audiences: z.array(z.string()).describe('Da 1 a 3 pubblici a cui il sito parla.'),
  palette: z.array(z.string()).describe('4 colori #RRGGBB, in ordine: principale, secondario, accento, sfondo.'),
});

export async function readWebsite(engine: AiEngine, meta: AiMeta, site: string, identity: Identity): Promise<WebsiteInsights> {
  const url = await assertPublicUrl(site);
  const host = normalizeSite(site);
  const colors = await readSiteColors(url.toString());

  const result = await engine.run({
    ...meta,
    task: 'website',
    tools: ['WebFetch'],
    schema: websiteSchema,
    system: SYSTEM,
    prompt: [
      'Leggi il sito del brand e ricava temi, pubblico e palette per il suo profilo.',
      '',
      describeIdentity(identity),
      `Indirizzo da aprire: ${url.toString()}`,
      '',
      'Apri la home e fino a 5 pagine interne che raccontano cosa fa (chi siamo, servizi o prodotti, casi, blog). Scrivi solo quello che hai letto: se il sito non si apre, pagesRead è 0 e proponi a partire da quello che ha scritto l’utente.',
      `- themes: 4 temi; ${THEME_RULES}.`,
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
    prompt: [`Proponi 4 temi editoriali per questo brand: ${THEME_RULES}.`, '', describeIdentity(identity)].join('\n'),
  });
  return cleanLabels(result.themes, 4);
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
