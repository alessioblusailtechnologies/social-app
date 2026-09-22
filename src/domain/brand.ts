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

/** Una card di esempio per un canale: il PNG composto da be-render e la pagina per ridisegnarla dal vivo. */
export interface VisualExample {
  channel: ChannelId;
  aspect: Aspect;
  page: VisualPage;
  /** Nullo nel mock, dove la card si disegna dal vivo. */
  file: MediaFile | null;
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
