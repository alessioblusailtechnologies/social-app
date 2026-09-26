import type { Brand, BrandKind, ChannelId, Theme } from '@shared/domain/brand';
import { isConnected } from '@shared/domain/brand';
import { CHANNELS } from '@shared/domain/catalog';
import { ideaPreferences, sourceTitle, type Idea, type IdeaDraft, type IdeaFormat, type IdeaSource } from '@shared/domain/idea';
import { themeLevelLabel } from '@shared/domain/themes';
import { formatDay } from '@shared/lib/dates';
import { createRng, pick, sample, seedFromString } from '@shared/lib/random';
import { normalizeSite } from '@shared/lib/site';

/**
 * Finta AI delle idee. Legge il Brand DNA (temi e pesi, pubblico, obiettivi, date,
 * fonti, canali) e le scelte passate, e scrive proposte plausibili e deterministiche.
 */

type Rng = () => number;

const DAY = 86_400_000;

const NUMBER_WORDS = ['zero', 'un', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci'];

function grammar(kind: BrandKind) {
  const person = kind === 'person';
  return {
    did: person ? 'ho fatto' : 'abbiamo fatto',
    changed: person ? 'ho cambiato' : 'abbiamo cambiato',
    think: person ? 'la penso' : 'la pensiamo',
    our: person ? 'mia' : 'nostra',
    asks: person ? 'mi fanno' : 'ci fanno',
    read: person ? 'Ho letto' : 'Abbiamo letto',
    learned: person ? 'ho tratto' : 'abbiamo tratto',
    agree: person ? 'sono d’accordo' : 'siamo d’accordo',
    doing: person ? 'faccio' : 'facciamo',
  };
}

type Grammar = ReturnType<typeof grammar>;

/** Minuscola iniziale, ma non sulle sigle: "Founder di PMI" → "founder di PMI", "PMI" resta. */
export function lowerFirst(text: string): string {
  if (text.length > 1 && text[1] === text[1].toUpperCase() && /[A-Z]/.test(text[1])) return text;
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function audienceOf(brand: Brand): string {
  const first = brand.positioning.audiences[0];
  return first ? lowerFirst(first) : 'chi ti segue';
}

const FORMAT_CHANNELS: Record<IdeaFormat, ChannelId[]> = {
  post: ['linkedin', 'instagram', 'facebook', 'x'],
  carousel: ['linkedin', 'instagram'],
  video: ['instagram', 'tiktok', 'linkedin'],
  article: ['linkedin'],
};

function channelsFor(brand: Brand, formats: IdeaFormat[]): ChannelId[] {
  const selected = CHANNELS.map(({ id }) => id).filter((id) => brand.channels[id].selected);
  const fitting = selected.filter((id) => formats.some((format) => FORMAT_CHANNELS[format].includes(id)));
  return fitting.length > 0 ? fitting : selected;
}

/** Tema scelto in proporzione al peso, corretto da quanto l'utente tiene le idee di quel tema. */
function pickTheme(themes: readonly Theme[], rng: Rng, scores: Map<string, number>): Theme {
  const weights = themes.map(
    (theme) => Math.max(1, theme.weight) * Math.max(0.3, 1 + (scores.get(theme.id) ?? 0) * 0.15),
  );
  let target = rng() * weights.reduce((sum, weight) => sum + weight, 0);
  for (let i = 0; i < themes.length; i++) {
    target -= weights[i];
    if (target <= 0) return themes[i];
  }
  return themes[themes.length - 1];
}

function words(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[a-zàèéìòù]{4,}/g) ?? []);
}

/** Il tema che condivide più parole con il testo, altrimenti il più pesante. */
function matchTheme(themes: readonly Theme[], text: string): Theme | null {
  if (themes.length === 0) return null;
  const textWords = words(text);
  let best = [...themes].sort((a, b) => b.weight - a.weight)[0];
  let bestOverlap = 0;
  for (const theme of themes) {
    const overlap = [...words(theme.name)].filter((word) => textWords.has(word)).length;
    if (overlap > bestOverlap) {
      best = theme;
      bestOverlap = overlap;
    }
  }
  return best;
}

interface ThemeContext {
  theme: string;
  audience: string;
  g: Grammar;
}

const THEME_FAMILIES: {
  label: string;
  formats: IdeaFormat[];
  title: (c: ThemeContext) => string;
  angle: (c: ThemeContext) => string;
}[] = [
  {
    label: 'Il caso con i numeri',
    formats: ['carousel', 'post'],
    title: (c) => `Tre numeri che raccontano il lavoro su «${c.theme}»`,
    angle: (c) =>
      `Scegli tre dati che hai davvero, come tempo, costi o errori, e spiega cosa significano per ${c.audience}. Niente percentuali generiche: solo cifre tue.`,
  },
  {
    label: 'L’errore raccontato',
    formats: ['post'],
    title: (c) => `L’errore che ${c.g.did} su «${c.theme}» e cosa ${c.g.changed}`,
    angle: () =>
      'Un fatto, una conseguenza misurabile, la regola che ne è uscita. Tono asciutto, senza autocommiserazione.',
  },
  {
    label: 'Il dietro le quinte',
    formats: ['video', 'carousel'],
    title: (c) => `Dietro le quinte di «${c.theme}»: una giornata vera`,
    angle: () =>
      'Mostra il lavoro com’è, con i passaggi che di solito non si vedono. Funziona in un video breve o in un carosello di foto reali.',
  },
  {
    label: 'La domanda frequente',
    formats: ['post', 'article'],
    title: (c) => `La domanda che ${c.audience} ${c.g.asks} sempre su «${c.theme}»`,
    angle: () =>
      'Rispondi in modo diretto nelle prime due righe, poi aggiungi il dettaglio che di solito non si dice. Chiudi con un esempio.',
  },
  {
    label: 'La tesi controcorrente',
    formats: ['post', 'article'],
    title: (c) => `Su «${c.theme}» ${c.g.think} diversamente dalla maggioranza`,
    angle: (c) =>
      `Parti dall’opinione diffusa, mostra con un caso concreto dove non torna e proponi l’alternativa. Scrivilo per ${c.audience}, non per i colleghi.`,
  },
  {
    label: 'Prima e dopo',
    formats: ['carousel'],
    title: (c) => `Prima e dopo: un caso concreto di «${c.theme}»`,
    angle: () =>
      'Due fotografie dello stesso processo a qualche mese di distanza. Il dato che è cambiato di più va nel titolo.',
  },
];

const TREND_TOPICS = [
  'l’AI nelle piccole imprese',
  'la settimana corta',
  'i prezzi che salgono e i clienti che confrontano',
  'la fiducia nelle recensioni online',
  'il ritorno del negozio fisico',
  'la sostenibilità dichiarata e quella misurata',
  'il lavoro ibrido tre anni dopo',
];

const SEASONS = [
  { month: 'gennaio', hook: 'gli obiettivi dell’anno nuovo' },
  { month: 'febbraio', hook: 'i primi conti dell’anno' },
  { month: 'marzo', hook: 'la chiusura del primo trimestre' },
  { month: 'aprile', hook: 'i progetti rimandati dall’inverno' },
  { month: 'maggio', hook: 'fiere ed eventi di settore' },
  { month: 'giugno', hook: 'il bilancio di metà anno' },
  { month: 'luglio', hook: 'cosa sistemare prima della pausa estiva' },
  { month: 'agosto', hook: 'il lavoro che continua mentre gli altri sono in ferie' },
  { month: 'settembre', hook: 'il rientro e i budget dell’ultimo trimestre' },
  { month: 'ottobre', hook: 'la pianificazione dell’anno prossimo' },
  { month: 'novembre', hook: 'la corsa di fine anno' },
  { month: 'dicembre', hook: 'il bilancio di un anno di lavoro' },
];

function isoDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Anniversari delle date che contano nei prossimi 60 giorni (o passati da meno di una settimana). */
export function upcomingAnniversaries(brand: Brand, now: Date) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return brand.references.milestones
    .map((milestone) => {
      const [year, month, day] = milestone.date.split('-').map(Number);
      const next = new Date(today.getFullYear(), month - 1, day);
      if (next.getTime() < today.getTime() - 7 * DAY) next.setFullYear(next.getFullYear() + 1);
      return {
        milestone,
        years: next.getFullYear() - year,
        date: isoDay(next),
        daysUntil: Math.round((next.getTime() - today.getTime()) / DAY),
      };
    })
    .filter(({ years, daysUntil }) => years >= 1 && daysUntil <= 60)
    .sort((a, b) => a.daysUntil - b.daysUntil);
}

function yearsLabel(years: number): string {
  if (years === 1) return 'Un anno';
  return `${capitalize(years <= 10 ? NUMBER_WORDS[years] : String(years))} anni`;
}

export interface GenerateOptions {
  count: number;
  now: Date;
}

export function generateIdeaDrafts(brand: Brand, existing: readonly Idea[], options: GenerateOptions): IdeaDraft[] {
  const rng = createRng(seedFromString(`${brand.id}|${existing.length}|${isoDay(options.now)}`));
  const g = grammar(brand.identity.kind);
  const audience = audienceOf(brand);
  const goal = brand.positioning.goals[0] ?? 'Farti conoscere';
  const { themeScores } = ideaPreferences(existing);
  const used = new Set(existing.map((idea) => idea.title));
  const drafts: IdeaDraft[] = [];

  const push = (draft: Omit<IdeaDraft, 'channels' | 'source'>) => {
    if (used.has(draft.title) || drafts.length >= options.count) return;
    used.add(draft.title);
    drafts.push({ ...draft, source: null, channels: channelsFor(brand, draft.formats) });
  };
  const themeFor = () => (brand.themes.length > 0 ? pickTheme(brand.themes, rng, themeScores) : null);

  // Segnali di contesto: ricorrenze, trend dalle fonti, stagione, rete.
  const anniversary = upcomingAnniversaries(brand, options.now)[0];
  if (anniversary) {
    const { milestone, years, date } = anniversary;
    push({
      title: `${yearsLabel(years)} da «${lowerFirst(milestone.label)}»: cosa è cambiato davvero`,
      angleLabel: 'La ricorrenza',
      angle:
        'Racconta com’era quel giorno e mettilo accanto a oggi: un numero di allora, uno di adesso e la decisione che ha fatto la differenza.',
      rationale: `La ricorrenza cade il ${formatDay(date)}: uscire nella settimana giusta vale più dell’orario perfetto.`,
      themeId: themeFor()?.id ?? null,
      signal: { kind: 'recurrence', label: `${milestone.label} · ${formatDay(date)}` },
      formats: ['post', 'carousel'],
    });
  }

  const trendSource = brand.references.sources.find(
    (source) => source.enabled && !/milestone|rete/i.test(source.label),
  );
  if (trendSource) {
    push({
      title: `Tutti parlano di ${pick(rng, TREND_TOPICS)}: la ${g.our} lettura`,
      angleLabel: 'Il commento',
      angle:
        'Riassumi il dibattito in una riga, poi prendi posizione con un fatto che conosci solo tu. Meglio uscire entro pochi giorni.',
      rationale: `Segnale da «${trendSource.label}»: un punto di vista preciso arriva prima dei riassunti.`,
      themeId: themeFor()?.id ?? null,
      signal: { kind: 'trend', label: `${trendSource.label} · questa settimana` },
      formats: ['post', 'article'],
    });
  }

  const season = SEASONS[options.now.getMonth()];
  push({
    title: `Parliamo di ${season.hook}: tre cose da fare adesso`,
    angleLabel: 'Il momento giusto',
    angle: `Tre azioni concrete che ${audience} possono fare nelle prossime settimane, ognuna con un esempio. Formato adatto a un carosello.`,
    rationale: `È ${season.month}: il tema è nelle agende di ${audience} proprio in queste settimane.`,
    themeId: themeFor()?.id ?? null,
    signal: { kind: 'season', label: `${capitalize(season.month)} · calendario` },
    formats: ['carousel', 'post'],
  });

  const networkEnabled = brand.references.sources.some((source) => source.enabled && /rete/i.test(source.label));
  if (networkEnabled && isConnected(brand.channels.linkedin)) {
    push({
      title: `Nella tua rete si parla di ${pick(rng, TREND_TOPICS)}: rispondi con un caso tuo`,
      angleLabel: 'La risposta con un caso',
      angle:
        'Non commentare il commento: porta un episodio concreto e un numero. È il modo più rapido per farti notare da chi già ti conosce.',
      rationale: `${6 + Math.floor(rng() * 20)} contatti ne hanno scritto negli ultimi sette giorni.`,
      themeId: themeFor()?.id ?? null,
      signal: { kind: 'network', label: 'La tua rete LinkedIn' },
      formats: ['post'],
    });
  }

  // Il resto dai temi, in proporzione ai pesi e alle scelte passate.
  for (let attempt = 0; drafts.length < options.count && attempt < options.count * 8; attempt++) {
    const theme = themeFor();
    if (!theme) break;
    const family = pick(rng, THEME_FAMILIES);
    const context = { theme: theme.name, audience, g };
    push({
      title: family.title(context),
      angleLabel: family.label,
      angle: family.angle(context),
      rationale: `«${theme.name}» nel piano esce ${themeLevelLabel(theme).toLowerCase()}. Obiettivo: ${lowerFirst(goal)}.`,
      themeId: theme.id,
      signal: { kind: 'theme', label: theme.name },
      formats: family.formats,
    });
  }

  return sample(rng, drafts, drafts.length);
}

/** "https://www.sole24ore.com/art/come-l-ai-cambia-la-contabilita-AbC?x=1" → titolo leggibile e dominio. */
export function describeLink(url: string): { host: string; title: string } {
  const withoutProtocol = url.trim().replace(/^https?:\/\//i, '');
  const [hostPart = '', ...path] = withoutProtocol.split('/');
  const host = normalizeSite(hostPart.split(/[?#]/)[0]);
  const slug = (path.filter(Boolean).pop() ?? '').split(/[?#]/)[0].replace(/\.[a-z0-9]+$/i, '');
  const readable = slug
    .replace(/[-_+]+/g, ' ')
    .replace(/\b[A-Za-z0-9]*\d[A-Za-z0-9]*\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return { host, title: readable.split(' ').length >= 3 ? capitalize(readable) : `Articolo di ${host || 'un sito'}` };
}

function documentTitle(name: string): string {
  return capitalize(name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim());
}

/** Il nucleo della nota: prima frase, massimo 110 caratteri, senza punteggiatura finale. */
export function coreOf(text: string): string {
  const first = text.trim().split(/[.!?\n]/)[0].trim();
  const short = first.length > 110 ? `${first.slice(0, first.lastIndexOf(' ', 107))}…` : first;
  return capitalize(short.replace(/[,;:\s]+$/, ''));
}

interface SourceFamily {
  label: string;
  formats: IdeaFormat[];
  title: string;
  angle: string;
}

function sourceFamilies(brand: Brand, source: IdeaSource): { families: SourceFamily[]; basis: string } {
  const g = grammar(brand.identity.kind);
  const audience = audienceOf(brand);

  if (source.kind === 'prompt') {
    const core = coreOf(source.text);
    return {
      basis: source.text,
      families: [
        {
          label: 'Il caso con i numeri',
          formats: ['carousel', 'post'],
          title: `${core}: i numeri, prima e dopo`,
          angle: 'Metti in fila il prima e il dopo con cifre precise. Basta una tabella: il resto lo dice il testo.',
        },
        {
          label: 'La tesi controcorrente',
          formats: ['post', 'article'],
          title: `${core}: perché non è quello che sembra`,
          angle: `Parti da quello che ${audience} danno per scontato e smontalo con il tuo caso.`,
        },
        {
          label: 'Il dietro le quinte',
          formats: ['video', 'carousel'],
          title: `Com’è andata davvero: ${lowerFirst(core)}`,
          angle: 'Racconta i passaggi, i dubbi e le persone coinvolte. Foto o video reali valgono più di qualsiasi grafica.',
        },
        {
          label: 'La lezione',
          formats: ['post'],
          title: `${core}: la lezione che ne ${g.learned}`,
          angle: `Chiudi con una regola che ${audience} possono applicare già domani.`,
        },
        {
          label: 'La domanda al pubblico',
          formats: ['post'],
          title: `${core}. Voi come la gestite?`,
          angle: 'Porta il tuo caso in tre righe e chiedi un confronto preciso, non un generico «che ne pensate».',
        },
      ],
    };
  }

  const note = source.note.trim() ? ` Parti da qui: «${source.note.trim()}».` : '';

  if (source.kind === 'link') {
    const { title } = describeLink(source.url);
    return {
      basis: `${title} ${source.note}`,
      families: [
        {
          label: 'Il commento',
          formats: ['post'],
          title: `${g.read} «${title}»: ecco il punto che manca`,
          angle: `Riassumi in una riga, poi aggiungi il caso che conferma o smentisce.${note}`,
        },
        {
          label: 'Cosa cambia per il pubblico',
          formats: ['carousel', 'post'],
          title: `Cosa significa «${title}» per ${audience}`,
          angle: `Traduci la notizia in tre conseguenze pratiche, dalla più immediata alla più lontana.${note}`,
        },
        {
          label: 'La domanda aperta',
          formats: ['post', 'article'],
          title: `La domanda che «${title}» non si fa`,
          angle: `Individua cosa manca nell’articolo e rispondi tu, con un esempio concreto.${note}`,
        },
        {
          label: 'Il caso che conferma',
          formats: ['post'],
          title: `«${title}»: un caso reale che lo conferma`,
          angle: `Racconta un episodio del tuo lavoro che rende concreto quello che l’articolo dice in astratto.${note}`,
        },
        {
          label: 'Il disaccordo',
          formats: ['post', 'article'],
          title: `Su «${title}» non ${g.agree} del tutto`,
          angle: `Riconosci cosa è giusto, poi spiega con un fatto dove la conclusione non regge.${note}`,
        },
      ],
    };
  }

  // Il materiale, nel mock, vale come un documento: se ne conosce solo il titolo.
  const title = documentTitle(source.kind === 'material' ? sourceTitle(source) : source.name);
  return {
    basis: `${title} ${source.note}`,
    families: [
      {
        label: 'Il dato che sorprende',
        formats: ['post', 'carousel'],
        title: `Il dato più sorprendente di «${title}»`,
        angle: `Un solo numero, spiegato bene: da dove viene e perché conta per ${audience}.${note}`,
      },
      {
        label: 'Il riassunto utile',
        formats: ['carousel'],
        title: `«${title}» in cinque punti per ${audience}`,
        angle: `Cinque slide, un punto per slide, nessun gergo. L’ultima dice cosa fare.${note}`,
      },
      {
        label: 'Il dietro le quinte',
        formats: ['video', 'post'],
        title: `Come è nato «${title}»`,
        angle: `Chi ci ha lavorato, quanto tempo è servito, cosa è stato tagliato.${note}`,
      },
      {
        label: 'La citazione',
        formats: ['post'],
        title: `Una frase di «${title}» da cui partire`,
        angle: `Scegli una frase del documento e costruiscici attorno un ragionamento breve.${note}`,
      },
      {
        label: 'Il confronto',
        formats: ['article', 'post'],
        title: `«${title}»: cosa dice e cosa ${g.doing} davvero`,
        angle: `Metti a confronto la teoria del documento con la pratica di tutti i giorni.${note}`,
      },
    ],
  };
}

/** Tre spunti da una fonte dell'utente; `variant` cambia i tagli ("rifai con un altro taglio"). */
export function draftsFromSource(brand: Brand, source: IdeaSource, variant = 0): IdeaDraft[] {
  const { families, basis } = sourceFamilies(brand, source);
  const rng = createRng(seedFromString(`${basis}|${variant}`));
  const theme = matchTheme(brand.themes, basis);
  const themeNote = theme ? ` Si lega a «${theme.name}», che nel piano esce ${themeLevelLabel(theme).toLowerCase()}.` : '';

  const signal =
    source.kind === 'prompt'
      ? { kind: 'prompt' as const, label: 'Una tua nota' }
      : source.kind === 'link'
        ? { kind: 'link' as const, label: describeLink(source.url).host }
        : source.kind === 'material'
          ? { kind: 'prompt' as const, label: sourceTitle(source) }
          : {
            kind: 'document' as const,
            label: source.size ? `${source.name} · ${Math.max(1, Math.round(source.size / 45_000))} pagine` : source.name,
          };

  const rationale =
    source.kind === 'prompt'
      ? `Nasce da una tua nota.${themeNote}`
      : source.kind === 'link'
        ? `Dal link che hai condiviso.${themeNote} Un commento con un punto di vista preciso vale più di una condivisione.`
        : `Dal documento che hai caricato.${themeNote} I contenuti tratti da materiale tuo sono i più difficili da copiare.`;

  return sample(rng, families, 3).map((family) => ({
    title: family.title,
    angleLabel: family.label,
    angle: family.angle,
    rationale,
    themeId: theme?.id ?? null,
    signal,
    source,
    formats: family.formats,
    channels: channelsFor(brand, family.formats),
  }));
}
