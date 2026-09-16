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

export interface Theme {
  id: string;
  name: string;
  /** Percentuale a multipli di 5; la somma dei temi fa 100. */
  weight: number;
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

export interface Visual {
  logoUri: string | null;
  palette: Palette;
  imageStyle: ImageStyle;
  typography: TypographyId;
  /** Logo piccolo in basso a destra sulle immagini generate. */
  signature: boolean;
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
