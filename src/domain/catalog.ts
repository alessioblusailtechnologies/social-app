import { palette } from '@/design-system/tokens';

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
