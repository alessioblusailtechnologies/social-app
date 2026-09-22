import type { Aspect, MediaFile, VisualPage } from './visual';

/**
 * Il Brand è l'identità che viene comunicata. Un account può gestirne più di uno
 * (sé stesso, la propria azienda, i clienti).
 */

export type BrandKind = 'person' | 'company' | 'client';

export type ChannelId = 'linkedin' | 'instagram' | 'facebook' | 'tiktok' | 'x';

export interface Identity {
  kind: BrandKind;
  name: string;
  /** Solo persona: ruolo. */
  role: string;
  /** Solo persona: azienda in cui lavora. */
  company: string;
  /** Azienda o cliente: settore. */
  sector: string;
  site: string;
  pitch: string;
}

export interface Positioning {
  goals: string[];
  audiences: string[];
  postsPerWeek: number;
}

export interface ChannelState {
  /** Il brand pubblica su questo canale: le proposte si adattano. */
  selected: boolean;
  /** Valorizzato quando il canale è collegato e si può pubblicare al posto dell'utente. */
  handle: string | null;
}

export type Channels = Record<ChannelId, ChannelState>;

/** Quanto spesso esce un tema nel piano: è quello che l'utente sceglie. */
export type ThemeLevel = 'often' | 'sometimes' | 'rarely';

export interface Theme {
  id: string;
  name: string;
  /** Percentuale intera, ricavata dal livello; la somma dei temi fa 100. La usano piano e idee. */
  weight: number;
  /** Manca nei temi salvati prima dei livelli: `themeLevel()` lo ricava dal peso. */
  level?: ThemeLevel;
  color: string;
}

export type VoiceSource = 'pasted' | 'history' | 'recording';

export interface VoiceCard {
  version: number;
  createdAt: string;
  source: VoiceSource;
  /** Es. "tre post incollati". */
  sourceLabel: string;
  register: string;
  rhythm: string;
  lexicon: string;
  avoid: string;
}

export interface Voice {
  /** Storico delle schede: l'ultima è quella in uso. */
  cards: VoiceCard[];
}

export type ImageStyle = 'flat-geometric' | 'desaturated-photo' | 'natural-photo' | 'text-only';

export interface Palette {
  id: string;
  name: string;
  colors: [string, string, string, string];
  origin: 'preset' | 'site' | 'custom';
}

/** La coppia di caratteri delle card: titoli e testo, da Google Fonts. */
export type TypographyId = 'inter' | 'archivo' | 'space-grotesk' | 'manrope' | 'fraunces' | 'dm-serif' | 'playfair' | 'ibm-plex';

/** Quello che l'AI ha ricavato dalle immagini di riferimento e dalle indicazioni. */
export interface VisualDirection {
  /** Com'è lo stile, in una frase per l'utente. */
  summary: string;
  /** Lo stile delle foto, in inglese, per il modello d'immagine. */
  photoStyle: string;
}

/** Un carattere della linea: l'id del catalogo `LINE_FONTS`, il peso e il corsivo. */
export interface LineFont {
  font: string;
  weight: number;
  italic: boolean;
}

/** Una rubrica fissa del feed, come «Sotto il cofano» o «Dal campo»: dà l'etichetta in alto alle card. */
export interface Rubric {
  name: string;
  /** Di cosa parla, per chi scrive i contenuti. */
  about: string;
}

/** Come sta la foto del brand nelle aperture: fascia che sfuma in basso, blocco in alto col testo sotto, a tutta card. */
export type LinePhoto = 'band' | 'block' | 'full';
/** In basso: filetto con firma e indirizzo, solo il marchio a destra, niente. */
export type LineFooter = 'rule' | 'mark' | 'none';
/** Dove sta il testo nelle card senza foto. */
export type LineAnchor = 'center' | 'top' | 'bottom';

/** Una famiglia di Google Fonts usata dai template del brand, coi pesi che servono. */
export interface TemplateFont {
  family: string;
  weights: number[];
  italic: boolean;
}

/**
 * Un template di card scritto per il brand dal direttore artistico, in HTML e CSS, come il generatore scritto a mano
 * per Velia: il motore riempie i segnaposti (`{{headline}}`, `{{photo}}`…), ripulisce e disegna. Vedi
 * `src/templates/custom.tsx`.
 */
export interface BrandTemplate {
  id: string;
  /** Il nome per l'utente, es. «Foto e titolo». */
  name: string;
  /** Quando usarlo: lo legge chi scrive le bozze. */
  use: string;
  /** I testi che mostra, tra kicker, headline, body, value, items, author. */
  fields: string[];
  /** Ha la foto: chi lo usa deve dire cosa mostra. */
  photo: boolean;
  html: string;
  css: string;
}

/**
 * La linea grafica del brand: le regole con cui si compone ogni card, come un generatore scritto a mano per quel
 * brand. La costruisce l'AI nel passo «Come appare»; i brand che non ce l'hanno ne ricevono una dalla palette e dai
 * caratteri (`brandKit`). Inchiostro, testo secondario, filetti e grigi si ricavano da fondo e accento. La
 * composizione (foto, rubrica, piede, testo) manca nelle prime linee: vale quella di assieme.
 */
export interface BrandLine {
  /**
   * I percorsi delle immagini di riferimento da cui è nata: con riferimenti diversi un'indicazione non corregge più
   * questa linea, se ne fa una nuova. Manca nelle linee di prima.
   */
  from?: string[];
  /** I template scritti per il brand: se ci sono, le card si disegnano con questi. */
  templates?: BrandTemplate[];
  /** Le famiglie di Google Fonts dei template. */
  fonts?: TemplateFont[];
  photo?: LinePhoto;
  /** La foto dentro i margini, col fondo attorno, invece che a filo. */
  inset?: boolean;
  /** La rubrica in alto a sinistra: si vede o no. */
  kicker?: boolean;
  footer?: LineFooter;
  anchor?: LineAnchor;
  /** Il fondo di tutte le card: uno solo, così il feed si riconosce a colpo d'occhio. */
  ground: string;
  /** Etichette di rubrica, numeri, la riga d'invito. */
  accent: string;
  /** La voce del brand: le frasi delle card. */
  voice: LineFont;
  /** I titoli asciutti, quando non parla la voce: un termine, un nome, un numero. */
  title: LineFont;
  /** Etichette in maiuscolo: rubrica, numeri, pagina, indirizzo. `spaced` le vuole spaziate lettera per lettera. */
  label: LineFont & { spaced: boolean };
  /** Le righe secondarie e i punti delle liste. */
  text: LineFont;
  /** La firma in basso a sinistra, es. «sono Velia.». */
  signature: string;
  /** In basso a destra quando non c'è la pagina: il sito o l'account. */
  address: string;
  /** La fascia fotografica delle card d'apertura: una foto del mondo del brand, la stessa per tutte. */
  band: { description: string; photo: MediaFile | null } | null;
  rubrics: Rubric[];
  /** Le regole dei testi sulle card, es. «niente punti esclamativi». */
  copy: string[];
}

/** Una card di esempio per un canale: il PNG composto da be-render e la pagina per ridisegnarla dal vivo. */
export interface VisualExample {
  channel: ChannelId;
  aspect: Aspect;
  page: VisualPage;
  /** Nullo nel mock, dove la card si disegna dal vivo. */
  file: MediaFile | null;
  /** La foto della card, per le card con la foto. */
  photo?: MediaFile | null;
  /** Cosa mostra la foto: serve a correggerla dopo. */
  photoDescription?: string;
}

export interface Visual {
  logoUri: string | null;
  palette: Palette;
  /** Li sceglie l'AI dalle immagini di riferimento; servono alle card e alle foto. */
  imageStyle: ImageStyle;
  typography: TypographyId;
  /** Logo piccolo in basso a destra sulle immagini generate. */
  signature: boolean;
  /** Le immagini che danno il tono. Mancano nei brand salvati prima dei riferimenti, come i campi sotto. */
  references?: MediaFile[];
  /** Le indicazioni dell'utente, in linguaggio naturale: «più minimal, titoli con le grazie». */
  notes?: string;
  direction?: VisualDirection | null;
  /** La linea grafica: manca nei brand salvati prima del motore delle card. */
  line?: BrandLine | null;
  examples?: VisualExample[];
}

export interface SignalSource {
  label: string;
  enabled: boolean;
}

export interface Milestone {
  id: string;
  label: string;
  /** YYYY-MM-DD */
  date: string;
}

export interface References {
  profiles: string[];
  sources: SignalSource[];
  milestones: Milestone[];
}

export interface BrandSections {
  identity: Identity;
  positioning: Positioning;
  channels: Channels;
  themes: Theme[];
  voice: Voice;
  visual: Visual;
  references: References;
}

export type SectionKey = keyof BrandSections;

export type BrandDraft = BrandSections;

/** La modifica di una singola sezione, con il valore tipizzato sulla chiave. */
export type SectionPatch = { [K in SectionKey]: { key: K; value: BrandSections[K] } }[SectionKey];

export function applyPatch<T extends BrandSections>(target: T, patch: SectionPatch): T {
  return { ...target, [patch.key]: patch.value };
}

const SECTION_KEY_SET = new Set<string>([
  'identity',
  'positioning',
  'channels',
  'themes',
  'voice',
  'visual',
  'references',
]);

export function isSectionKey(value: unknown): value is SectionKey {
  return typeof value === 'string' && SECTION_KEY_SET.has(value);
}

export interface Brand extends BrandSections {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export function currentVoiceCard(voice: Voice): VoiceCard | null {
  return voice.cards.length > 0 ? voice.cards[voice.cards.length - 1] : null;
}

export function isConnected(channel: ChannelState): boolean {
  return channel.handle !== null;
}
