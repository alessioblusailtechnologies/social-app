import type { Brand, BrandLine, BrandTemplate, ChannelId, LineAnchor, LineFont, LineFooter, LinePhoto, TemplateFont } from './brand';
import { lineFontByFamily, lineFontOption, TYPOGRAPHY_OPTIONS, type FontFace, type LineFontOption } from './catalog';
import type { CarouselSlide } from './content';
import type { IdeaFormat } from './idea';

/**
 * Il visivo di un contenuto: card composte dai template del brand, con una foto o un soggetto
 * scontornato quando il tipo lo chiede. Il modello d'immagine fornisce solo ingredienti: il post
 * lo compone sempre un template, con i colori e i caratteri del brand, e il testo non sta mai
 * dentro l'immagine generata. Vedi docs/piano-visivi.md.
 */

export type VisualKind = 'infographic' | 'photo' | 'mixed';
export type VisualStatus = 'proposed' | 'creating' | 'ready' | 'failed';
export type VisualStep = 'image' | 'cutout' | 'render';
export type ImageRole = 'photo' | 'cutout';
export type Aspect = '4:5' | '1:1' | '9:16' | '1.91:1';

export const VISUAL_KINDS: VisualKind[] = ['infographic', 'photo', 'mixed'];

export const VISUAL_KIND_LABELS: Record<VisualKind, string> = {
  infographic: 'Infografica',
  photo: 'Foto',
  mixed: 'Mista',
};

export const VISUAL_STEP_LABELS: Record<VisualStep, string> = {
  image: 'Genero la foto',
  cutout: 'Scontorno il soggetto',
  render: 'Compongo la card',
};

export interface CardItem {
  title: string;
  body: string;
}

/** I testi di una card, per ruolo e non per template: così si cambia layout senza riscriverli. */
export interface CardText {
  /** Etichetta breve sopra il titolo, o il ruolo di chi parla in una citazione. */
  kicker: string;
  headline: string;
  /** Frase di supporto, o il testo della citazione. */
  body: string;
  /** Il numero grande, es. «3 ore» o «72%». */
  value: string;
  /** Punti di una lista o passi. */
  items: CardItem[];
  /** Chi lo dice, nelle citazioni. */
  author: string;
}

export interface MediaFile {
  /** Dove sta nello Storage; nullo nel mock. */
  path: string | null;
  /** Da dove si carica. Sul backend è un indirizzo firmato, rifatto a ogni lettura. */
  url: string;
}

export interface VisualImage {
  /** Cosa si vede: la scrive l'AI con la bozza, l'utente la può cambiare. */
  description: string;
  source: 'generated' | 'upload';
  photo: MediaFile | null;
  /** Il soggetto scontornato dalla foto, quando un template lo chiede. */
  cutout: MediaFile | null;
}

export interface VisualPage {
  /** Il layout del motore: quello che si disegna se il brand non ha un template suo con l'id di `custom`. */
  templateId: TemplateId;
  /** Un template scritto per il brand (`BrandLine.templates`): se c'è, la card si disegna con quello. */
  custom?: string;
  text: CardText;
}

export interface VisualRender {
  page: number;
  aspect: Aspect;
  file: MediaFile;
}

export interface VisualDesign {
  kind: VisualKind;
  /** Una pagina per il post, una per slide nel carosello. */
  pages: VisualPage[];
  /**
   * I template disegnati per *questo* contenuto, non per il brand: li scrive l'agente guardando le
   * card d'esempio dell'onboarding, e vivono qui perché valgono solo per questa card. Al render si
   * uniscono a quelli del brand nel kit; `VisualPage.custom` ne porta l'id.
   */
  templates?: BrandTemplate[];
  /** Le famiglie di Google Fonts che quei template usano: senza, la card esce coi caratteri di sistema. */
  fonts?: TemplateFont[];
  image: VisualImage;
  status: VisualStatus;
  /** Il passo in corso durante la creazione. */
  step: VisualStep | null;
  /** Perché la creazione non è riuscita, detto all'utente. */
  error: string | null;
  /** I testi della bozza rifatta dopo la creazione: si applicano con «Aggiorna il visivo». */
  nextPages: VisualPage[] | null;
  /** I PNG composti sul server, per pagina e formato: vuoto nel mock e finché non sono pronti. */
  renders: VisualRender[];
}

// ---------------------------------------------------------------------------
// Catalogo dei template
// ---------------------------------------------------------------------------

export type TemplateId =
  | 'statement'
  | 'stat'
  | 'list'
  | 'steps'
  | 'quote'
  | 'photo-cover'
  | 'photo-frame'
  | 'photo-only'
  | 'cutout-statement'
  | 'cutout-stat'
  | 'split'
  | 'point'
  | 'closing';

export type CardField = 'kicker' | 'headline' | 'body' | 'value' | 'items' | 'author';

/** `single` fa il post o la copertina del carosello; `point` e `closing` sono le altre slide. */
export type TemplateRole = 'single' | 'point' | 'closing';

/** Un rettangolo dello schizzo, in frazioni della card: la miniatura della proposta. */
export interface SketchBlock {
  x: number;
  y: number;
  w: number;
  h: number;
  tone: 'ink' | 'soft' | 'accent' | 'image';
}

export interface TemplateSpec {
  id: TemplateId;
  name: string;
  kind: VisualKind;
  role: TemplateRole;
  image: ImageRole | null;
  /** Senza questi testi il template non si usa. */
  requires: CardField[];
  /** I testi che mostra, nell'ordine in cui si modificano. */
  fields: CardField[];
  items: { min: number; max: number; titled: boolean } | null;
  /** Quando usarlo: finisce nel prompt della bozza. */
  hint: string;
  /** Il fondo della card, per lo schizzo. */
  ground: 'primary' | 'ground' | 'image';
  sketch: SketchBlock[];
}

const textLines = (y: number, widths: number[], tone: SketchBlock['tone'] = 'ink', x = 0.085): SketchBlock[] =>
  widths.map((w, i) => ({ x, y: y + i * 0.075, w, h: 0.05, tone }));

/** La rubrica in alto e il piede con filetto e firma: ogni tavola li ha, come in assieme. */
const KICKER: SketchBlock = { x: 0.085, y: 0.07, w: 0.26, h: 0.022, tone: 'accent' };
const FOOTER: SketchBlock[] = [
  { x: 0.085, y: 0.895, w: 0.83, h: 0.004, tone: 'soft' },
  { x: 0.085, y: 0.922, w: 0.2, h: 0.024, tone: 'soft' },
  { x: 0.76, y: 0.925, w: 0.155, h: 0.018, tone: 'soft' },
];

const rows = (ys: number[], titled: boolean): SketchBlock[] =>
  ys.flatMap((y): SketchBlock[] => [
    { x: 0.085, y, w: 0.83, h: 0.003, tone: 'soft' },
    { x: 0.085, y: y + 0.03, w: 0.05, h: 0.022, tone: 'accent' },
    { x: 0.17, y: y + 0.028, w: titled ? 0.36 : 0.62, h: 0.026, tone: 'ink' },
    ...(titled ? [{ x: 0.17, y: y + 0.066, w: 0.58, h: 0.02, tone: 'soft' as const }] : []),
  ]);

export const TEMPLATES: TemplateSpec[] = [
  {
    id: 'statement',
    name: 'Frase',
    kind: 'infographic',
    role: 'single',
    image: null,
    requires: ['headline'],
    fields: ['kicker', 'headline', 'body'],
    items: null,
    hint: 'una frase della voce del brand che si regge da sola: una tesi, una domanda, un errore comune; sotto, facoltativa, una riga che la completa',
    ground: 'ground',
    sketch: [KICKER, ...textLines(0.36, [0.8, 0.72, 0.46]), { x: 0.085, y: 0.62, w: 0.56, h: 0.024, tone: 'soft' }, ...FOOTER],
  },
  {
    id: 'stat',
    name: 'Dato',
    kind: 'infographic',
    role: 'single',
    image: null,
    requires: ['value', 'headline'],
    fields: ['kicker', 'value', 'headline', 'body'],
    items: null,
    hint: 'un numero grande e la frase che lo spiega; solo con un dato vero o da completare tra parentesi quadre',
    ground: 'ground',
    sketch: [
      KICKER,
      { x: 0.085, y: 0.24, w: 0.46, h: 0.17, tone: 'accent' },
      ...textLines(0.48, [0.76, 0.52]),
      { x: 0.085, y: 0.68, w: 0.56, h: 0.024, tone: 'soft' },
      ...FOOTER,
    ],
  },
  {
    id: 'list',
    name: 'Lista',
    kind: 'infographic',
    role: 'single',
    image: null,
    requires: ['headline', 'items'],
    fields: ['kicker', 'headline', 'items'],
    items: { min: 3, max: 5, titled: false },
    hint: 'un titolo e da 3 a 5 punti brevi, numerati: consigli, errori, motivi',
    ground: 'ground',
    sketch: [KICKER, ...textLines(0.17, [0.7, 0.44]), ...rows([0.38, 0.49, 0.6, 0.71], false), ...FOOTER],
  },
  {
    id: 'steps',
    name: 'Passi',
    kind: 'infographic',
    role: 'single',
    image: null,
    requires: ['headline', 'items'],
    fields: ['kicker', 'headline', 'items'],
    items: { min: 3, max: 4, titled: true },
    hint: 'un processo in 3 o 4 passi, ognuno con un titolo corto e una frase',
    ground: 'ground',
    sketch: [KICKER, ...textLines(0.17, [0.66]), ...rows([0.32, 0.47, 0.62], true), ...FOOTER],
  },
  {
    id: 'quote',
    name: 'Citazione',
    kind: 'infographic',
    role: 'single',
    image: null,
    requires: ['body', 'author'],
    fields: ['body', 'author', 'kicker'],
    items: null,
    hint: 'una frase detta da qualcuno (chi pubblica, un cliente, il team), con chi la dice',
    ground: 'ground',
    sketch: [KICKER, ...textLines(0.32, [0.8, 0.74, 0.56]), { x: 0.085, y: 0.6, w: 0.26, h: 0.022, tone: 'accent' }, ...FOOTER],
  },
  {
    id: 'photo-cover',
    name: 'Frase con fascia',
    kind: 'photo',
    role: 'single',
    image: 'photo',
    requires: ['headline'],
    fields: ['kicker', 'headline', 'body'],
    items: null,
    hint: 'l’apertura: una frase breve della voce e, in basso, una fascia con la foto che sfuma nel fondo',
    ground: 'ground',
    sketch: [
      KICKER,
      ...textLines(0.26, [0.74, 0.5]),
      { x: 0.085, y: 0.44, w: 0.5, h: 0.024, tone: 'soft' },
      { x: 0, y: 0.62, w: 1, h: 0.38, tone: 'image' },
    ],
  },
  {
    id: 'photo-frame',
    name: 'Foto nel riquadro',
    kind: 'photo',
    role: 'single',
    image: 'photo',
    requires: ['headline'],
    fields: ['kicker', 'headline'],
    items: null,
    hint: 'la frase in alto e sotto la foto grande in un riquadro bordato',
    ground: 'ground',
    sketch: [KICKER, ...textLines(0.14, [0.74, 0.5]), { x: 0.085, y: 0.36, w: 0.83, h: 0.5, tone: 'image' }, ...FOOTER],
  },
  {
    id: 'photo-only',
    name: 'Solo foto',
    kind: 'photo',
    role: 'single',
    image: 'photo',
    requires: [],
    fields: [],
    items: null,
    hint: 'solo la foto con la firma del brand in basso, quando l’immagine dice tutto e il testo sta nella didascalia',
    ground: 'image',
    sketch: [{ x: 0, y: 0, w: 1, h: 0.87, tone: 'image' }, ...FOOTER],
  },
  {
    id: 'cutout-statement',
    name: 'Frase con soggetto',
    kind: 'mixed',
    role: 'single',
    image: 'cutout',
    requires: ['headline'],
    fields: ['kicker', 'headline'],
    items: null,
    hint: 'la frase in alto e un soggetto scontornato (una persona, un prodotto, un oggetto) appoggiato al piede',
    ground: 'ground',
    sketch: [KICKER, ...textLines(0.15, [0.74, 0.54]), { x: 0.36, y: 0.4, w: 0.56, h: 0.48, tone: 'image' }, ...FOOTER],
  },
  {
    id: 'cutout-stat',
    name: 'Dato con soggetto',
    kind: 'mixed',
    role: 'single',
    image: 'cutout',
    requires: ['value', 'headline'],
    fields: ['kicker', 'value', 'headline'],
    items: null,
    hint: 'un numero grande accanto a un soggetto scontornato',
    ground: 'ground',
    sketch: [
      KICKER,
      { x: 0.085, y: 0.18, w: 0.4, h: 0.15, tone: 'accent' },
      ...textLines(0.4, [0.4, 0.34]),
      { x: 0.5, y: 0.36, w: 0.45, h: 0.52, tone: 'image' },
      ...FOOTER,
    ],
  },
  {
    id: 'split',
    name: 'Metà foto',
    kind: 'mixed',
    role: 'single',
    image: 'photo',
    requires: ['headline'],
    fields: ['kicker', 'headline', 'body', 'items'],
    items: { min: 0, max: 3, titled: false },
    hint: 'la foto in alto a tutta larghezza e sotto la frase, con una riga o con due o tre punti',
    ground: 'ground',
    sketch: [
      { x: 0, y: 0, w: 1, h: 0.44, tone: 'image' },
      { x: 0.085, y: 0.5, w: 0.26, h: 0.022, tone: 'accent' },
      ...textLines(0.55, [0.74, 0.5]),
      { x: 0.085, y: 0.73, w: 0.6, h: 0.024, tone: 'soft' },
      ...FOOTER,
    ],
  },
  {
    id: 'point',
    name: 'Punto',
    kind: 'infographic',
    role: 'point',
    image: null,
    requires: ['headline'],
    fields: ['headline', 'body'],
    items: null,
    hint: 'slide centrale del carosello: il numero del punto, la frase e una riga che la spiega',
    ground: 'ground',
    sketch: [
      KICKER,
      { x: 0.085, y: 0.3, w: 0.08, h: 0.026, tone: 'accent' },
      ...textLines(0.36, [0.78, 0.7, 0.4]),
      { x: 0.085, y: 0.62, w: 0.6, h: 0.024, tone: 'soft' },
      ...FOOTER,
    ],
  },
  {
    id: 'closing',
    name: 'Chiusura',
    kind: 'infographic',
    role: 'closing',
    image: null,
    requires: ['headline'],
    fields: ['headline', 'body'],
    items: null,
    hint: 'ultima slide del carosello o post d’invito: la frase che chiude e, in accento, dove andare o cosa fare',
    ground: 'ground',
    sketch: [KICKER, ...textLines(0.36, [0.72, 0.5]), { x: 0.085, y: 0.54, w: 0.34, h: 0.026, tone: 'accent' }, ...FOOTER],
  },
];

const SPECS = new Map(TEMPLATES.map((spec) => [spec.id, spec]));

export const TEMPLATE_IDS = TEMPLATES.map((spec) => spec.id) as [TemplateId, ...TemplateId[]];

export function templateSpec(id: TemplateId): TemplateSpec {
  return SPECS.get(id) ?? SPECS.get('statement')!;
}

export function isTemplateId(value: unknown): value is TemplateId {
  return typeof value === 'string' && SPECS.has(value as TemplateId);
}

/** I template che fanno un post o la copertina di un carosello. */
export const SINGLE_TEMPLATES = TEMPLATES.filter((spec) => spec.role === 'single');

export const CARD_FIELD_LABELS: Record<CardField, string> = {
  kicker: 'Etichetta',
  headline: 'Titolo',
  body: 'Frase',
  value: 'Numero',
  items: 'Punti',
  author: 'Chi lo dice',
};

// ---------------------------------------------------------------------------
// Testi della card
// ---------------------------------------------------------------------------

export const CARD_LIMITS = {
  kicker: 32,
  headline: 90,
  body: 200,
  value: 10,
  author: 60,
  itemTitle: 40,
  itemBody: 90,
  items: 5,
  description: 600,
} as const;

export function emptyCardText(): CardText {
  return { kicker: '', headline: '', body: '', value: '', items: [], author: '' };
}

/** Taglia all'ultima parola intera sotto il limite. */
export function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.–-]+$/, '');
}

export function cleanCardText(text: Partial<CardText> | null | undefined): CardText {
  return {
    kicker: clip(text?.kicker ?? '', CARD_LIMITS.kicker),
    headline: clip(text?.headline ?? '', CARD_LIMITS.headline),
    body: clip(text?.body ?? '', CARD_LIMITS.body),
    value: clip(text?.value ?? '', CARD_LIMITS.value),
    author: clip(text?.author ?? '', CARD_LIMITS.author),
    items: (text?.items ?? [])
      .map((item) => ({ title: clip(item.title ?? '', CARD_LIMITS.itemTitle), body: clip(item.body ?? '', CARD_LIMITS.itemBody) }))
      .filter((item) => item.title || item.body)
      .slice(0, CARD_LIMITS.items),
  };
}

function hasField(text: CardText, field: CardField, spec: TemplateSpec): boolean {
  if (field === 'items') {
    const min = spec.items?.min ?? 1;
    const usable = text.items.filter((item) => (spec.items?.titled ? item.title && item.body : item.title || item.body));
    return usable.length >= min;
  }
  return text[field].length > 0;
}

export function fitsTemplate(spec: TemplateSpec, text: CardText): boolean {
  return spec.requires.every((field) => hasField(text, field, spec));
}

/** Quanto un template valorizza i testi che ci sono: il dato, i punti, la citazione. */
function affinity(spec: TemplateSpec, text: CardText): number {
  let score = 0;
  if (spec.requires.includes('value')) score += 4;
  if (spec.requires.includes('items')) score += text.items.length >= 3 ? 3 : 0;
  if (spec.id === 'steps' && text.items.every((item) => item.title)) score += 1;
  if (spec.requires.includes('author')) score += 3;
  if (spec.id === 'photo-only' && text.headline) score -= 2;
  // Lo scontorno è un passo in più: si propone quando il dato lo giustifica, non come prima scelta.
  if (spec.image === 'cutout') score -= 0.5;
  return score;
}

/** I layout possibili per un tipo e quei testi, dal più adatto. */
export function layoutOptions(kind: VisualKind, text: CardText): TemplateSpec[] {
  return SINGLE_TEMPLATES.filter((spec) => spec.kind === kind && fitsTemplate(spec, text))
    .map((spec, order) => ({ spec, score: affinity(spec, text), order }))
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map(({ spec }) => spec);
}

const FALLBACK: Record<VisualKind, TemplateId> = { infographic: 'statement', photo: 'photo-only', mixed: 'split' };

/** Il template scelto se va bene per tipo e testi, altrimenti il più adatto. */
export function chooseTemplate(kind: VisualKind, text: CardText, preferred?: TemplateId | null): TemplateId {
  const options = layoutOptions(kind, text);
  if (preferred && options.some((spec) => spec.id === preferred)) return preferred;
  return options[0]?.id ?? FALLBACK[kind];
}

// ---------------------------------------------------------------------------
// Pagine e proposta
// ---------------------------------------------------------------------------

function roleOf(index: number, count: number): TemplateRole {
  if (index === 0) return 'single';
  return index === count - 1 ? 'closing' : 'point';
}

function templateFor(kind: VisualKind, index: number, page: VisualPage, count: number): TemplateId {
  const role = roleOf(index, count);
  if (role === 'single') return chooseTemplate(kind, page.text, page.templateId);
  return role;
}

function normalizePages(kind: VisualKind, pages: readonly VisualPage[]): VisualPage[] {
  const rubric = cleanCardText(pages[0]?.text).kicker;
  return pages.map((page, index) => {
    // La rubrica è quella della copertina su ogni slide, come nei caroselli di assieme.
    const text = cleanCardText(index === 0 ? page.text : { ...page.text, kicker: rubric });
    // Con un template del brand il layout del motore è solo la sua riserva: resta quello scelto con il template.
    if (page.custom) return { text, templateId: page.templateId, custom: page.custom };
    return { text, templateId: templateFor(kind, index, { ...page, text }, pages.length) };
  });
}

export interface VisualProposal {
  kind: VisualKind;
  templateId: TemplateId | null;
  text: CardText;
  imageDescription: string;
}

/** Le pagine del carosello: la copertina dalla proposta, poi un punto per slide e la chiusura. */
function carouselPages(cover: CardText, slides: readonly CarouselSlide[]): VisualPage[] {
  const rest = slides.slice(1);
  const pages: VisualPage[] = rest.map((slide) => ({
    templateId: 'point',
    text: { ...emptyCardText(), headline: slide.title, body: slide.body },
  }));
  return [{ templateId: 'statement', text: cover }, ...pages];
}

/** La proposta di visivo che accompagna la bozza. Nulla per i video. */
export function proposeDesign(proposal: VisualProposal, format: IdeaFormat, slides: readonly CarouselSlide[]): VisualDesign | null {
  if (format === 'video') return null;
  let cover = cleanCardText(proposal.text);
  if (!cover.headline && slides[0]) cover = { ...cover, headline: clip(slides[0].title, CARD_LIMITS.headline) };
  const pages =
    format === 'carousel' && slides.length > 1
      ? carouselPages(cover, slides)
      : [{ templateId: proposal.templateId ?? 'statement', text: cover }];
  if (pages[0]) pages[0] = { ...pages[0], templateId: proposal.templateId ?? pages[0].templateId };
  return {
    kind: proposal.kind,
    pages: normalizePages(proposal.kind, pages),
    image: { description: clip(proposal.imageDescription, CARD_LIMITS.description), source: 'generated', photo: null, cutout: null },
    status: 'proposed',
    step: null,
    error: null,
    nextPages: null,
    renders: [],
  };
}

/** Una proposta senza AI, dai testi della bozza: per le bozze nate prima dei visivi. */
export function fallbackDesign(format: IdeaFormat, headline: string, slides: readonly CarouselSlide[]): VisualDesign | null {
  return proposeDesign(
    { kind: 'infographic', templateId: null, text: { ...emptyCardText(), headline }, imageDescription: '' },
    format,
    slides,
  );
}

// ---------------------------------------------------------------------------
// Immagini e creazione
// ---------------------------------------------------------------------------

/**
 * Un template disegnato per questo contenuto, se la pagina ne porta l'id. Va cercato prima dello
 * spec del motore: il `templateId` di una pagina così è solo il ripiego per be-render, e guardare
 * quello direbbe che non serve nessuna foto anche quando il layout ne ha una.
 */
export function pageTemplate(design: VisualDesign, page: VisualPage): BrandTemplate | undefined {
  return page.custom ? design.templates?.find((template) => template.id === page.custom) : undefined;
}

export function imageRoles(design: VisualDesign): ImageRole[] {
  const roles = new Set<ImageRole>();
  for (const page of design.pages) {
    const drawn = pageTemplate(design, page);
    // I template disegnati ricevono `{{photo}}` ma non il soggetto scontornato: al massimo una foto.
    const role = drawn ? (drawn.photo ? ('photo' as const) : null) : templateSpec(page.templateId).image;
    if (role) roles.add(role);
  }
  return [...roles];
}

/** I passi che servono per avere il visivo: la foto se manca, lo scontorno se serve, la composizione. */
export function creationSteps(design: VisualDesign): VisualStep[] {
  const roles = imageRoles(design);
  const needsCutout = roles.includes('cutout') && !design.image.cutout;
  const needsPhoto = (roles.includes('photo') || needsCutout) && !design.image.photo;
  return [...(needsPhoto ? (['image'] as const) : []), ...(needsCutout ? (['cutout'] as const) : []), 'render'];
}

/** Mancano ingredienti: il visivo va (ri)creato, non basta ricomporlo. */
export function needsImages(design: VisualDesign): boolean {
  return creationSteps(design).some((step) => step !== 'render');
}

/** Le modifiche che l'utente fa senza AI. Il resto (file, stato) lo decide chi le applica. */
export interface VisualEdit {
  kind: VisualKind;
  pages: VisualPage[];
  description: string;
  /** Torna alla foto generata dopo averne caricata una. */
  source: VisualImage['source'];
  /** «Torna alla proposta». */
  reopen: boolean;
}

export function toEdit(design: VisualDesign): VisualEdit {
  return {
    kind: design.kind,
    pages: design.pages,
    description: design.image.description,
    source: design.image.source,
    reopen: false,
  };
}

export class VisualBusyError extends Error {
  constructor() {
    super('Il visivo è in creazione: aspetta che sia pronto.');
  }
}

export function editDesign(current: VisualDesign, edit: VisualEdit): VisualDesign {
  if (current.status === 'creating') throw new VisualBusyError();
  const pages = normalizePages(
    edit.kind,
    current.pages.map((page, i) => edit.pages[i] ?? page),
  );
  const description = clip(edit.description, CARD_LIMITS.description);

  let image = current.image;
  if (edit.source === 'generated' && image.source === 'upload') {
    image = { description, source: 'generated', photo: null, cutout: null };
  } else if (description !== image.description) {
    // Una foto generata segue la descrizione: cambiata quella, la foto va rifatta. Una foto caricata resta.
    image = image.source === 'generated' ? { description, source: 'generated', photo: null, cutout: null } : { ...image, description };
  }

  const next: VisualDesign = { ...current, kind: edit.kind, pages, image, error: null };
  const changed = JSON.stringify([current.kind, current.pages, current.image]) !== JSON.stringify([next.kind, next.pages, next.image]);
  if (changed) next.renders = [];
  if (edit.reopen || (changed && next.status === 'failed') || (next.status === 'ready' && needsImages(next))) {
    next.status = 'proposed';
  }
  return next;
}

/** Una foto dell'utente al posto di quella generata: lo scontorno, se serve, si rifà creando. */
export function withUploadedPhoto(current: VisualDesign, photo: MediaFile): VisualDesign {
  if (current.status === 'creating') throw new VisualBusyError();
  const kind: VisualKind = current.kind === 'infographic' ? 'mixed' : current.kind;
  const next: VisualDesign = {
    ...current,
    kind,
    pages: normalizePages(kind, current.pages),
    image: { ...current.image, source: 'upload', photo, cutout: null },
    renders: [],
    error: null,
  };
  if (next.status !== 'proposed' && needsImages(next)) next.status = 'proposed';
  return next;
}

/** «Rigenera»: si butta la foto generata e si ricrea con la stessa descrizione. */
export function withoutPhoto(current: VisualDesign): VisualDesign {
  if (current.status === 'creating') throw new VisualBusyError();
  return {
    ...current,
    image: { ...current.image, source: 'generated', photo: null, cutout: null },
    renders: [],
    error: null,
  };
}

/** La bozza è stata rifatta: un visivo già creato resta e aspetta «Aggiorna il visivo». */
export function redoDesign(previous: VisualDesign | null | undefined, proposed: VisualDesign | null): VisualDesign | null {
  // La bozza non propone più un visivo: rifare il testo non deve cancellare la card già disegnata.
  // Resta quella, coi suoi testi, finché non si chiede di ridisegnarla o di modificarli.
  if (!proposed) return previous ?? null;
  if (!previous) return proposed;
  const created = previous.status === 'ready' || previous.status === 'creating';
  if (created && previous.pages.length === proposed.pages.length) return { ...previous, nextPages: proposed.pages };
  // La foto già fatta non si butta: con un formato diverso serve lo stesso.
  return previous.image.photo ? { ...proposed, image: previous.image } : proposed;
}

/** «Aggiorna il visivo»: i testi nuovi nei layout scelti, poi si ricompone. */
export function refreshDesign(current: VisualDesign): VisualDesign {
  if (!current.nextPages) return current;
  if (current.status === 'creating') throw new VisualBusyError();
  const pages = current.nextPages.map((page, i) => {
    const kept = i === 0 ? (current.pages[0] ?? page) : page;
    return { text: page.text, templateId: kept.templateId, ...(kept.custom && { custom: kept.custom }) };
  });
  return { ...current, pages: normalizePages(current.kind, pages), nextPages: null, renders: [] };
}

// ---------------------------------------------------------------------------
// Formati
// ---------------------------------------------------------------------------

/** Le misure dei template: tutti larghi 1080, l'anteprima li scala. */
export const ASPECT_SIZES: Record<Aspect, { width: number; height: number }> = {
  '4:5': { width: 1080, height: 1350 },
  '1:1': { width: 1080, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1.91:1': { width: 1080, height: 565 },
};

/** Margini dentro cui stanno testi e firma. In 9:16 lasciano spazio all'interfaccia di TikTok e delle storie. */
export const SAFE_AREAS: Record<Aspect, { top: number; right: number; bottom: number; left: number }> = {
  '4:5': { top: 96, right: 88, bottom: 88, left: 88 },
  '1:1': { top: 80, right: 80, bottom: 76, left: 80 },
  '9:16': { top: 250, right: 96, bottom: 400, left: 96 },
  '1.91:1': { top: 56, right: 72, bottom: 52, left: 72 },
};

export function aspectFor(channel: ChannelId, format: IdeaFormat): Aspect {
  if (format === 'article') return '1.91:1';
  if (channel === 'tiktok') return '9:16';
  if (channel === 'x') return '1:1';
  return '4:5';
}

/** Larghezza su altezza di un formato di card, per chi disegna un riquadro con le sue proporzioni. */
export function aspectRatio(aspect: Aspect): number {
  return ASPECT_SIZES[aspect].width / ASPECT_SIZES[aspect].height;
}

/**
 * Il formato del riquadro in cui l'AI lavora a un contenuto: verticale per un video, orizzontale per un articolo, la
 * card del feed per il resto.
 */
export function stageAspect(format: IdeaFormat): number {
  return format === 'video' ? aspectRatio('9:16') : format === 'article' ? aspectRatio('1.91:1') : aspectRatio('4:5');
}

export function aspectsFor(channels: readonly ChannelId[], format: IdeaFormat): Aspect[] {
  return [...new Set(channels.map((channel) => aspectFor(channel, format)))];
}

/** La proporzione in cui chiedere la foto: quella che, ritagliata, serve meglio tutti i formati. */
export function photoAspectFor(aspects: readonly Aspect[]): '4:5' | '9:16' | '16:9' | '1:1' {
  if (aspects.length === 1 && aspects[0] === '9:16') return '9:16';
  if (aspects.length === 1 && aspects[0] === '1.91:1') return '16:9';
  if (aspects.length === 1 && aspects[0] === '1:1') return '1:1';
  return '4:5';
}

/** Instagram e TikTok non pubblicano un post senza immagine o video. */
export function needsMedia(channel: ChannelId): boolean {
  return channel === 'instagram' || channel === 'tiktok';
}

/** I canali che aspettano il visivo prima di poter approvare; chi esce senza immagine per scelta non aspetta. */
export function channelsWaitingForVisual(
  format: IdeaFormat,
  channels: readonly ChannelId[],
  design: VisualDesign | null | undefined,
  withoutImage: readonly ChannelId[] = [],
): ChannelId[] {
  if (format === 'video' || design?.status === 'ready') return [];
  return channels.filter((channel) => needsMedia(channel) && !withoutImage.includes(channel));
}

// ---------------------------------------------------------------------------
// Kit del brand
// ---------------------------------------------------------------------------

/** Un carattere pronto per i template: la famiglia con i ripieghi di sistema, il peso e il corsivo. */
export interface KitFace {
  family: string;
  /** Per `font-family`: la famiglia del brand, poi i caratteri di sistema dello stesso genere. */
  stack: string;
  weight: number;
  italic: boolean;
}

/** I colori della linea per ruolo, come nel generatore di assieme: si ricavano tutti da fondo e accento. */
export interface LineTones {
  ground: string;
  /** Il testo principale. */
  ink: string;
  /** Le righe secondarie. */
  soft: string;
  /** Pagina e indirizzo. */
  muted: string;
  accent: string;
  /** Filetti e bordi dei riquadri. */
  rule: string;
}

/** La linea grafica pronta per i template: quella del brand, o quella ricavata da palette e caratteri. */
export interface KitLine {
  tones: LineTones;
  voice: KitFace;
  title: KitFace;
  label: KitFace & { spaced: boolean };
  text: KitFace;
  /** La firma scritta: il carattere della voce, in corsivo se ce l'ha. */
  sign: KitFace;
  signature: string;
  address: string;
  /** L'iniziale del brand, per il marchio in basso quando non c'è il logo. */
  monogram: string;
  /** La foto delle aperture, già firmata; nulla finché non c'è. */
  bandUrl: string | null;
  photo: LinePhoto;
  inset: boolean;
  kicker: boolean;
  footer: LineFooter;
  anchor: LineAnchor;
  /** I template scritti per il brand, se ci sono. */
  templates: BrandTemplate[];
}

export interface BrandKit {
  name: string;
  colors: { primary: string; secondary: string; accent: string; ground: string };
  /** La coppia di caratteri di prima della linea: la usa ancora chi mostra la palette. */
  heading: FontFace;
  body: FontFace;
  /** Il foglio di Google Fonts con le facce che servono alla linea. */
  fontsHref: string;
  /** Un foglio per famiglia dei caratteri dei template del brand: se uno non si carica, gli altri sì. */
  fontLinks: string[];
  /** Le facce da aspettare prima di disegnare, in forma CSS: `italic 400 48px "Newsreader"`. */
  faces: string[];
  logoUrl: string | null;
  /** Il logo al posto della firma scritta, in basso a sinistra. */
  signature: boolean;
  treatment: 'natural' | 'desaturated';
  line: KitLine;
}

export const DEFAULT_TYPOGRAPHY = TYPOGRAPHY_OPTIONS[0];

export function typographyOption(id: string | null | undefined) {
  return TYPOGRAPHY_OPTIONS.find((option) => option.id === id) ?? DEFAULT_TYPOGRAPHY;
}

/** Il foglio di Google Fonts con esattamente le facce chieste: un peso o un corsivo in più fa fallire tutto. */
export function googleFontsHref(faces: readonly (FontFace & { italic?: boolean })[]): string {
  const styles = new Map<string, Map<string, [number, number]>>();
  for (const face of faces) {
    const set = styles.get(face.family) ?? new Map<string, [number, number]>();
    const italic = face.italic ? 1 : 0;
    set.set(`${italic},${face.weight}`, [italic, face.weight]);
    styles.set(face.family, set);
  }
  const families = [...styles.entries()].map(([family, set]) => {
    const tuples = [...set.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const name = family.replace(/ /g, '+');
    return tuples.some(([italic]) => italic === 1)
      ? `family=${name}:ital,wght@${tuples.map(([italic, weight]) => `${italic},${weight}`).join(';')}`
      : `family=${name}:wght@${tuples.map(([, weight]) => weight).join(';')}`;
  });
  return `https://fonts.googleapis.com/css2?${families.join('&')}&display=swap`;
}

function hexOr(value: string | null | undefined, fallback: string): string {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : fallback;
}

/** `share` di `b` dentro `a`, in esadecimale. */
export function mixHex(a: string, b: string, share: number): string {
  const channel = (hex: string, i: number) => parseInt(hex.slice(i, i + 2), 16);
  return `#${[1, 3, 5]
    .map((i) => Math.round(channel(a, i) * (1 - share) + channel(b, i) * share))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')}`.toUpperCase();
}

const FALLBACK_VOICE = 'newsreader';
const FALLBACK_TEXT = 'inter';

function nearestWeight(option: LineFontOption, weight: number): number {
  return option.weights.reduce((best, candidate) => (Math.abs(candidate - weight) < Math.abs(best - weight) ? candidate : best));
}

function fontStack(option: LineFontOption): string {
  const generic =
    option.kind === 'serif' ? 'Georgia, serif' : option.kind === 'mono' ? 'ui-monospace, Consolas, monospace' : 'system-ui, sans-serif';
  return `"${option.family}", ${generic}`;
}

/** Un carattere della linea sul catalogo: un id sconosciuto prende il ripiego, peso e corsivo solo se esistono. */
function kitFace(font: Partial<LineFont> | null | undefined, fallback: string): KitFace {
  const option = lineFontOption(font?.font) ?? lineFontOption(fallback)!;
  return {
    family: option.family,
    stack: fontStack(option),
    weight: nearestWeight(option, font?.weight ?? 400),
    italic: Boolean(font?.italic) && option.italic,
  };
}

/** «https://www.forno.it/» → «forno.it». */
export function siteLabel(site: string | null | undefined): string {
  return (site ?? '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/+$/, '')
    .toLowerCase();
}

/**
 * La linea dei brand salvati prima del motore delle card: fondo scuro se il colore principale lo è, altrimenti lo
 * sfondo della palette; i caratteri dalla coppia scelta; la firma col nome e il sito.
 */
export function defaultLine(identity: { name: string; site?: string }, visual: Pick<Brand['visual'], 'palette' | 'typography'>): BrandLine {
  const [primary, , accent, ground] = visual.palette.colors.map((color, i) => hexOr(color, ['#1C2150', '#2F3452', '#FF6B35', '#ECEEEF'][i]));
  const pair = typographyOption(visual.typography);
  const heading = lineFontByFamily(pair.heading.family)?.id ?? FALLBACK_VOICE;
  const body = lineFontByFamily(pair.body.family)?.id ?? FALLBACK_TEXT;
  return {
    ground: isDark(primary) ? primary : ground,
    accent,
    voice: { font: heading, weight: pair.heading.weight, italic: false },
    title: { font: heading, weight: pair.heading.weight, italic: false },
    label: { font: body, weight: 600, italic: false, spaced: false },
    text: { font: body, weight: 400, italic: false },
    signature: identity.name.trim(),
    address: siteLabel(identity.site),
    band: null,
    rubrics: [],
    copy: [],
  };
}

const INK_DARK = '#15171F';
const INK_LIGHT = '#FFFFFF';

/** L'accento su quel fondo: se non si legge, scivola verso l'inchiostro finché non si legge. */
function legibleAccent(accent: string, ground: string, ink: string): string {
  let color = accent;
  for (let share = 0.15; contrastRatio(color, ground) < 3.2 && share <= 1; share += 0.15) color = mixHex(accent, ink, share);
  return color;
}

/**
 * I colori per ruolo da fondo e accento. L'inchiostro è un colore della palette se si legge benissimo (un avorio su
 * un fondo scuro, un navy su un fondo chiaro), altrimenti bianco o quasi nero; il resto sono sue sfumature sul fondo.
 */
export function lineTones(ground: string, accent: string, palette: readonly string[] = []): LineTones {
  const bg = hexOr(ground, '#14181D');
  const own = palette
    .map((color) => hexOr(color, ''))
    .filter((color) => color && color !== bg)
    .map((color) => ({ color, ratio: contrastRatio(color, bg) }))
    .sort((a, b) => b.ratio - a.ratio)[0];
  const ink =
    own && own.ratio >= 9 ? own.color : contrastRatio(INK_LIGHT, bg) >= contrastRatio(INK_DARK, bg) ? INK_LIGHT : INK_DARK;
  return {
    ground: bg,
    ink,
    soft: mixHex(ink, bg, 0.2),
    muted: mixHex(ink, bg, 0.45),
    accent: legibleAccent(hexOr(accent, ink), bg, ink),
    rule: mixHex(ink, bg, 0.82),
  };
}

/** Una famiglia di Google Fonts dei template: nomi e pesi solo se sensati, così il foglio non va in errore per poco. */
function templateFontHref(font: TemplateFont): string | null {
  const family = font.family.trim();
  if (!/^[A-Za-z0-9 ]{2,60}$/.test(family)) return null;
  const weights = [...new Set(font.weights.filter((weight) => Number.isInteger(weight) && weight >= 100 && weight <= 900))];
  return googleFontsHref((weights.length > 0 ? weights : [400]).flatMap((weight) => [
    { family, weight },
    ...(font.italic ? [{ family, weight, italic: true }] : []),
  ]));
}

function templateFontFaces(font: TemplateFont): string[] {
  const weights = font.weights.length > 0 ? font.weights : [400];
  return weights.flatMap((weight) => [`${weight} 48px "${font.family}"`, ...(font.italic ? [`italic ${weight} 48px "${font.family}"`] : [])]);
}

const faceCss = (face: KitFace) => `${face.italic ? 'italic ' : ''}${face.weight} 48px "${face.family}"`;

/**
 * Il kit con dentro anche i template disegnati per questo contenuto e i loro caratteri. Serve in tre
 * posti che devono vedere la stessa card: il render sul server, l'anteprima dal vivo nell'app e il
 * riquadro del riepilogo. Senza, `src/templates/index.tsx` non trova l'id di `page.custom` e ripiega
 * in silenzio su un layout del motore — la card esce diversa e nessuno se ne accorge.
 */
export function withDesignTemplates(kit: BrandKit, design: Pick<VisualDesign, 'templates' | 'fonts'>): BrandKit {
  const templates = design.templates ?? [];
  if (templates.length === 0) return kit;
  const fonts = design.fonts ?? [];
  return {
    ...kit,
    line: { ...kit.line, templates: [...kit.line.templates, ...templates] },
    fontLinks: [...new Set([...kit.fontLinks, ...fonts.flatMap((font) => templateFontHref(font) ?? [])])],
    faces: [...new Set([...kit.faces, ...fonts.flatMap(templateFontFaces)])],
  };
}

export function brandKit(brand: {
  identity: Pick<Brand['identity'], 'name'> & Partial<Pick<Brand['identity'], 'site'>>;
  visual: Brand['visual'];
}): BrandKit {
  const { visual } = brand;
  const [primary, secondary, accent, ground] = visual.palette.colors;
  const colors = {
    primary: hexOr(primary, '#1C2150'),
    secondary: hexOr(secondary, '#2F3452'),
    accent: hexOr(accent, '#FF6B35'),
    ground: hexOr(ground, '#ECEEEF'),
  };
  // I brand salvati prima dei caratteri non hanno il campo: prendono la coppia di base.
  const type = typographyOption(visual.typography);
  const line = visual.line ?? defaultLine(brand.identity, visual);

  const voice = kitFace(line.voice, FALLBACK_VOICE);
  const title = kitFace(line.title, line.voice?.font ?? FALLBACK_VOICE);
  const label = { ...kitFace(line.label, FALLBACK_TEXT), spaced: Boolean(line.label?.spaced) };
  const text = kitFace(line.text, FALLBACK_TEXT);
  const sign = kitFace({ ...line.voice, weight: 400, italic: true }, FALLBACK_VOICE);
  const faces = [voice, title, label, text, sign];

  return {
    name: brand.identity.name,
    colors,
    heading: type.heading,
    body: type.body,
    fontsHref: googleFontsHref(faces),
    fontLinks: (line.fonts ?? []).flatMap((font) => (templateFontHref(font) ? [templateFontHref(font)!] : [])),
    faces: [...new Set([...faces.map(faceCss), ...(line.fonts ?? []).flatMap(templateFontFaces)])],
    logoUrl: visual.logoUri,
    signature: visual.signature && Boolean(visual.logoUri),
    treatment: visual.imageStyle === 'desaturated-photo' ? 'desaturated' : 'natural',
    line: {
      tones: lineTones(line.ground, line.accent, Object.values(colors)),
      voice,
      title,
      label,
      text,
      sign,
      signature: line.signature?.trim() || brand.identity.name,
      address: line.address?.trim() ?? '',
      monogram: (brand.identity.name.trim().match(/[\p{L}\p{N}]/u)?.[0] ?? '·').toUpperCase(),
      bandUrl: line.band?.photo?.url || null,
      // Le linee di prima non hanno la composizione: vale quella di assieme.
      photo: line.photo ?? 'band',
      inset: line.inset ?? false,
      kicker: line.kicker ?? true,
      footer: line.footer ?? 'rule',
      anchor: line.anchor ?? 'center',
      templates: line.templates ?? [],
    },
  };
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Il rapporto di contrasto WCAG tra due colori esadecimali. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(hexOr(a, '#808080')), luminance(hexOr(b, '#808080'))].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

export function isDark(hex: string): boolean {
  return luminance(hexOr(hex, '#808080')) < 0.36;
}

/** Il colore del testo su un fondo: un colore del brand se si legge bene, altrimenti quasi nero o bianco. */
export function inkOn(background: string, kit: BrandKit): string {
  const own = [kit.colors.primary, kit.colors.secondary, kit.colors.ground]
    .filter((color) => color !== background.toUpperCase())
    .map((color) => ({ color, ratio: contrastRatio(color, background) }))
    .sort((a, b) => b.ratio - a.ratio)[0];
  if (own && own.ratio >= 7) return own.color;
  return contrastRatio(INK_LIGHT, background) >= contrastRatio(INK_DARK, background) ? INK_LIGHT : INK_DARK;
}

/** L'accento su un fondo, se regge il testo grande; altrimenti l'inchiostro. */
export function accentOn(background: string, kit: BrandKit): string {
  return contrastRatio(kit.colors.accent, background) >= 3 ? kit.colors.accent : inkOn(background, kit);
}
