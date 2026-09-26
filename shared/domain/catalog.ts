import { palette } from '@shared/design-system/tokens';

import type {
  BrandDraft,
  BrandKind,
  ChannelId,
  Channels,
  ImageStyle,
  Palette,
  SignalSource,
  TypographyId,
} from './brand';
import type { IdeaFormat } from './idea';

export const KIND_OPTIONS: { kind: BrandKind; title: string; meta: string; label: string }[] = [
  {
    kind: 'person',
    title: 'Per me',
    meta: 'Personal brand: parli in prima persona, con il tuo nome',
    label: 'Personal brand',
  },
  {
    kind: 'company',
    title: 'Per la mia azienda',
    meta: 'Il brand parla a nome del team, dei servizi e dei prodotti',
    label: 'Azienda',
  },
  {
    kind: 'client',
    title: 'Per un cliente',
    meta: 'Curi la presenza di qualcun altro, come agenzia o freelance',
    label: 'Cliente',
  },
];

export function kindLabel(kind: BrandKind): string {
  return KIND_OPTIONS.find((option) => option.kind === kind)?.label ?? '';
}

export const CHANNELS: { id: ChannelId; name: string }[] = [
  { id: 'linkedin', name: 'LinkedIn' },
  { id: 'instagram', name: 'Instagram' },
  { id: 'facebook', name: 'Facebook' },
  { id: 'tiktok', name: 'TikTok' },
  { id: 'x', name: 'X' },
];

export function channelName(id: ChannelId): string {
  return CHANNELS.find((channel) => channel.id === id)?.name ?? id;
}

/** I formati che hanno senso su ogni canale: il visivo si sceglie tra questi. */
export const CHANNEL_FORMATS: Record<ChannelId, IdeaFormat[]> = {
  linkedin: ['post', 'carousel', 'article', 'video'],
  instagram: ['post', 'carousel', 'video'],
  facebook: ['post', 'carousel', 'video'],
  tiktok: ['video'],
  x: ['post', 'article'],
};

export const GOALS: Record<BrandKind, string[]> = {
  person: [
    'Autorevolezza nel settore',
    'Trovare clienti',
    'Attirare candidati',
    'Raccogliere investimenti',
    'Costruire una community',
  ],
  company: [
    'Far conoscere il brand',
    'Vendere di più',
    'Fidelizzare i clienti',
    'Lanciare un prodotto',
    'Attirare candidati',
    'Costruire una community',
  ],
  client: [
    'Far conoscere il brand',
    'Vendere di più',
    'Fidelizzare i clienti',
    'Lanciare un prodotto',
    'Attirare candidati',
    'Costruire una community',
  ],
};

export const AUDIENCES: Record<BrandKind, string[]> = {
  person: ['Founder di PMI', 'Direttori operativi', 'Sviluppatori', 'Investitori', 'Candidati'],
  company: ['Clienti privati', 'Aziende', 'Rivenditori', 'Candidati', 'Community locale'],
  client: ['Clienti privati', 'Aziende', 'Rivenditori', 'Candidati', 'Community locale'],
};

/** Colori dei temi: pallini e barre, mai testo. */
export const THEME_COLORS = [
  palette.navy700,
  palette.orange500,
  palette.lime400,
  palette.mint400,
  palette.yellow400,
  palette.navy500,
];

export const PALETTE_PRESETS: Palette[] = [
  {
    id: 'indigo-coral',
    name: 'Indigo e coral',
    colors: ['#1C2150', '#2F3452', '#FF6B35', '#ECEEEF'],
    origin: 'preset',
  },
  {
    id: 'navy-lime',
    name: 'Navy e lime',
    colors: ['#2F3452', '#D9E05B', '#6DD47E', '#FFFFFF'],
    origin: 'preset',
  },
  {
    id: 'navy-grey',
    name: 'Solo navy e grigio',
    colors: ['#2F3452', '#8A8F9A', '#CDD1D4', '#ECEEEF'],
    origin: 'preset',
  },
];

export const PALETTE_SLOT_LABELS = ['Principale', 'Secondario', 'Accento', 'Sfondo'] as const;

export const IMAGE_STYLES: { id: ImageStyle; label: string }[] = [
  { id: 'flat-geometric', label: 'Geometrico piatto' },
  { id: 'desaturated-photo', label: 'Fotografico desaturato' },
  { id: 'natural-photo', label: 'Fotografico naturale' },
  { id: 'text-only', label: 'Solo testo' },
];

export function imageStyleLabel(id: ImageStyle): string {
  return IMAGE_STYLES.find((style) => style.id === id)?.label ?? '';
}

export interface FontFace {
  family: string;
  weight: number;
}

/** Coppie di Google Fonts (licenza OFL) per le card: il testo usa sempre anche il peso 600. */
export const TYPOGRAPHY_OPTIONS: { id: TypographyId; name: string; heading: FontFace; body: FontFace }[] = [
  { id: 'inter', name: 'Moderno', heading: { family: 'Inter Tight', weight: 700 }, body: { family: 'Inter', weight: 400 } },
  { id: 'archivo', name: 'Deciso', heading: { family: 'Archivo', weight: 800 }, body: { family: 'Archivo', weight: 400 } },
  {
    id: 'space-grotesk',
    name: 'Tecnico',
    heading: { family: 'Space Grotesk', weight: 700 },
    body: { family: 'Inter', weight: 400 },
  },
  { id: 'manrope', name: 'Morbido', heading: { family: 'Manrope', weight: 800 }, body: { family: 'Manrope', weight: 400 } },
  { id: 'fraunces', name: 'Editoriale', heading: { family: 'Fraunces', weight: 700 }, body: { family: 'Inter', weight: 400 } },
  {
    id: 'dm-serif',
    name: 'Elegante',
    heading: { family: 'DM Serif Display', weight: 400 },
    body: { family: 'DM Sans', weight: 400 },
  },
  {
    id: 'playfair',
    name: 'Classico',
    heading: { family: 'Playfair Display', weight: 700 },
    body: { family: 'Source Sans 3', weight: 400 },
  },
  {
    id: 'ibm-plex',
    name: 'Istituzionale',
    heading: { family: 'IBM Plex Sans', weight: 700 },
    body: { family: 'IBM Plex Sans', weight: 400 },
  },
];

export function typographyName(id: TypographyId | undefined): string {
  return (TYPOGRAPHY_OPTIONS.find((option) => option.id === id) ?? TYPOGRAPHY_OPTIONS[0]).name;
}

export type FontKind = 'serif' | 'sans' | 'mono';

/**
 * I caratteri della linea grafica, da Google Fonts (licenza OFL). Pesi e corsivo sono quelli che Google serve
 * davvero: chiederne uno che non c'è fa fallire tutto il foglio, e la card esce coi caratteri di sistema.
 */
export interface LineFontOption {
  id: string;
  family: string;
  kind: FontKind;
  weights: readonly number[];
  italic: boolean;
  /** Com'è, per l'AI che lo sceglie. */
  note: string;
}

const range = (from: number, to: number) => Array.from({ length: (to - from) / 100 + 1 }, (_, i) => from + i * 100);

export const LINE_FONTS: LineFontOption[] = [
  { id: 'newsreader', family: 'Newsreader', kind: 'serif', weights: range(200, 800), italic: true, note: 'serif da quotidiano, caldo e leggibile, bellissimo in corsivo' },
  { id: 'source-serif', family: 'Source Serif 4', kind: 'serif', weights: range(200, 900), italic: true, note: 'serif sobrio e istituzionale, vicino a Georgia' },
  { id: 'fraunces', family: 'Fraunces', kind: 'serif', weights: range(100, 900), italic: true, note: 'serif morbido e con carattere, artigianale' },
  { id: 'playfair', family: 'Playfair Display', kind: 'serif', weights: range(400, 900), italic: true, note: 'serif ad alto contrasto, moda ed eleganza' },
  { id: 'dm-serif', family: 'DM Serif Display', kind: 'serif', weights: [400], italic: true, note: 'serif da titolo, deciso ed elegante; solo peso 400' },
  { id: 'instrument-serif', family: 'Instrument Serif', kind: 'serif', weights: [400], italic: true, note: 'serif stretto e contemporaneo, da rivista; solo peso 400' },
  { id: 'eb-garamond', family: 'EB Garamond', kind: 'serif', weights: range(400, 800), italic: true, note: 'garamond classico: libri, tradizione, cultura' },
  { id: 'cormorant', family: 'Cormorant Garamond', kind: 'serif', weights: range(300, 700), italic: true, note: 'garamond sottile e raffinato, lusso discreto; solo in corpi grandi' },
  { id: 'lora', family: 'Lora', kind: 'serif', weights: range(400, 700), italic: true, note: 'serif morbido e cordiale' },
  { id: 'inter-tight', family: 'Inter Tight', kind: 'sans', weights: range(100, 900), italic: true, note: 'grottesco neutro e compatto, moderno' },
  { id: 'inter', family: 'Inter', kind: 'sans', weights: range(100, 900), italic: false, note: 'sans neutro, il più leggibile per i testi' },
  { id: 'archivo', family: 'Archivo', kind: 'sans', weights: range(100, 900), italic: true, note: 'grottesco robusto e deciso' },
  { id: 'space-grotesk', family: 'Space Grotesk', kind: 'sans', weights: range(300, 700), italic: false, note: 'grottesco tecnico, tecnologia' },
  { id: 'manrope', family: 'Manrope', kind: 'sans', weights: range(200, 800), italic: false, note: 'sans morbido e rotondo' },
  { id: 'dm-sans', family: 'DM Sans', kind: 'sans', weights: range(100, 900), italic: true, note: 'sans geometrico, pulito e cordiale' },
  { id: 'work-sans', family: 'Work Sans', kind: 'sans', weights: range(100, 900), italic: true, note: 'grottesco caldo, da studio grafico' },
  { id: 'plus-jakarta', family: 'Plus Jakarta Sans', kind: 'sans', weights: range(200, 800), italic: true, note: 'sans geometrico contemporaneo' },
  { id: 'source-sans', family: 'Source Sans 3', kind: 'sans', weights: range(200, 900), italic: true, note: 'sans umanista, sobrio' },
  { id: 'ibm-plex-sans', family: 'IBM Plex Sans', kind: 'sans', weights: range(100, 700), italic: true, note: 'sans istituzionale e tecnico' },
  { id: 'syne', family: 'Syne', kind: 'sans', weights: range(400, 800), italic: false, note: 'sans espressivo, mondo creativo e arte' },
  { id: 'ibm-plex-mono', family: 'IBM Plex Mono', kind: 'mono', weights: range(100, 700), italic: true, note: 'mono istituzionale, da etichetta' },
  { id: 'jetbrains-mono', family: 'JetBrains Mono', kind: 'mono', weights: range(100, 800), italic: true, note: 'mono tecnico e netto' },
  { id: 'space-mono', family: 'Space Mono', kind: 'mono', weights: [400, 700], italic: true, note: 'mono con carattere, un po’ retrò' },
  { id: 'dm-mono', family: 'DM Mono', kind: 'mono', weights: [300, 400, 500], italic: true, note: 'mono morbido e leggero' },
];

export function lineFontOption(id: string | null | undefined): LineFontOption | null {
  return LINE_FONTS.find((font) => font.id === id) ?? null;
}

/** Il carattere del catalogo con quel nome di famiglia: i brand di prima hanno solo la coppia dei titoli e dei testi. */
export function lineFontByFamily(family: string): LineFontOption | null {
  return LINE_FONTS.find((font) => font.family === family) ?? null;
}

const DEFAULT_SOURCES: Record<BrandKind, SignalSource[]> = {
  person: [
    { label: 'Stampa economica', enabled: true },
    { label: 'Testate di settore', enabled: true },
    { label: 'La tua rete LinkedIn', enabled: true },
    { label: 'Eventi di settore', enabled: true },
    { label: 'Discussioni su X', enabled: false },
    { label: 'Le tue milestone', enabled: true },
  ],
  company: [
    { label: 'Testate di settore', enabled: true },
    { label: 'Recensioni dei clienti', enabled: true },
    { label: 'Trend su Instagram e TikTok', enabled: true },
    { label: 'Fiere ed eventi', enabled: true },
    { label: 'Ricorrenze e stagionalità', enabled: true },
    { label: 'Le milestone dell’azienda', enabled: true },
  ],
  client: [
    { label: 'Testate di settore', enabled: true },
    { label: 'Recensioni dei clienti', enabled: true },
    { label: 'Trend su Instagram e TikTok', enabled: true },
    { label: 'Fiere ed eventi', enabled: true },
    { label: 'Ricorrenze e stagionalità', enabled: true },
    { label: 'Le milestone del cliente', enabled: true },
  ],
};

function emptyChannels(): Channels {
  const channels = {} as Channels;
  for (const { id } of CHANNELS) channels[id] = { selected: false, handle: null };
  return channels;
}

export function createEmptyDraft(kind: BrandKind): BrandDraft {
  return {
    identity: { kind, name: '', role: '', company: '', sector: '', site: '', pitch: '' },
    positioning: { goals: [], audiences: [], postsPerWeek: 3 },
    channels: emptyChannels(),
    themes: [],
    voice: { cards: [] },
    visual: {
      logoUri: null,
      palette: PALETTE_PRESETS[0],
      imageStyle: 'flat-geometric',
      typography: 'inter',
      signature: true,
    },
    references: { profiles: [], sources: DEFAULT_SOURCES[kind].map((s) => ({ ...s })), milestones: [] },
  };
}

/**
 * Cambiare tipo di brand a onboarding iniziato: si tengono i testi scritti,
 * si azzera ciò che dipende dal tipo (obiettivi, pubblico, fonti).
 */
export function changeDraftKind(draft: BrandDraft, kind: BrandKind): BrandDraft {
  if (draft.identity.kind === kind) return draft;
  const empty = createEmptyDraft(kind);
  return {
    ...draft,
    identity: { ...draft.identity, kind },
    positioning: { ...draft.positioning, goals: [], audiences: [] },
    references: { ...draft.references, sources: empty.references.sources },
  };
}
