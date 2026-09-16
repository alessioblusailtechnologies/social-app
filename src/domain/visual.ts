import type { Brand, ChannelId } from './brand';
import { TYPOGRAPHY_OPTIONS, type FontFace } from './catalog';
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
  templateId: TemplateId;
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

const headlineLines = (y: number, widths: number[], x = 0.1): SketchBlock[] =>
  widths.map((w, i) => ({ x, y: y + i * 0.085, w, h: 0.06, tone: 'ink' }));

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
    hint: 'una frase forte che si regge da sola: una tesi, una domanda, un errore comune',
    ground: 'primary',
    sketch: [
      { x: 0.1, y: 0.12, w: 0.28, h: 0.03, tone: 'accent' },
      ...headlineLines(0.36, [0.78, 0.7, 0.46]),
      { x: 0.1, y: 0.66, w: 0.6, h: 0.03, tone: 'soft' },
      { x: 0.1, y: 0.8, w: 0.1, h: 0.08, tone: 'accent' },
      { x: 0.21, y: 0.8, w: 0.1, h: 0.08, tone: 'soft' },
    ],
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
    hint: 'un numero che sorprende e la frase che lo spiega; solo con un dato vero o da completare tra parentesi quadre',
    ground: 'ground',
    sketch: [
      { x: 0.1, y: 0.12, w: 0.28, h: 0.03, tone: 'soft' },
      { x: 0.1, y: 0.26, w: 0.6, h: 0.22, tone: 'accent' },
      ...headlineLines(0.56, [0.76, 0.52]),
      { x: 0.1, y: 0.78, w: 0.56, h: 0.03, tone: 'soft' },
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
    hint: 'da 3 a 5 punti brevi: consigli, errori, motivi',
    ground: 'ground',
    sketch: [
      ...headlineLines(0.12, [0.7, 0.44]),
      ...[0.4, 0.52, 0.64, 0.76].flatMap((y): SketchBlock[] => [
        { x: 0.1, y, w: 0.05, h: 0.04, tone: 'accent' },
        { x: 0.19, y, w: 0.62, h: 0.04, tone: 'soft' },
      ]),
    ],
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
    sketch: [
      ...headlineLines(0.12, [0.66]),
      ...[0.3, 0.48, 0.66].flatMap((y): SketchBlock[] => [
        { x: 0.1, y, w: 0.1, h: 0.08, tone: 'accent' },
        { x: 0.26, y, w: 0.4, h: 0.035, tone: 'ink' },
        { x: 0.26, y: y + 0.05, w: 0.56, h: 0.03, tone: 'soft' },
      ]),
    ],
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
    ground: 'primary',
    sketch: [
      { x: 0.1, y: 0.12, w: 0.14, h: 0.1, tone: 'accent' },
      ...headlineLines(0.32, [0.8, 0.74, 0.56]),
      { x: 0.1, y: 0.74, w: 0.08, h: 0.01, tone: 'accent' },
      { x: 0.22, y: 0.72, w: 0.34, h: 0.035, tone: 'soft' },
    ],
  },
  {
    id: 'photo-cover',
    name: 'Titolo sulla foto',
    kind: 'photo',
    role: 'single',
    image: 'photo',
    requires: ['headline'],
    fields: ['kicker', 'headline'],
    items: null,
    hint: 'il titolo sopra una foto a tutta pagina, con un velo del colore del brand',
    ground: 'image',
    sketch: [
      { x: 0, y: 0, w: 1, h: 1, tone: 'image' },
      { x: 0.1, y: 0.58, w: 0.26, h: 0.03, tone: 'accent' },
      ...headlineLines(0.66, [0.78, 0.5]),
    ],
  },
  {
    id: 'photo-frame',
    name: 'Foto con fascia',
    kind: 'photo',
    role: 'single',
    image: 'photo',
    requires: ['headline'],
    fields: ['kicker', 'headline', 'body'],
    items: null,
    hint: 'una foto grande e una fascia di colore con il titolo e una frase',
    ground: 'primary',
    sketch: [
      { x: 0, y: 0, w: 1, h: 0.6, tone: 'image' },
      ...headlineLines(0.68, [0.74, 0.48]),
      { x: 0.1, y: 0.86, w: 0.5, h: 0.03, tone: 'soft' },
    ],
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
    hint: 'solo la foto con la firma del brand, quando l’immagine dice tutto e il testo sta nella didascalia',
    ground: 'image',
    sketch: [
      { x: 0, y: 0, w: 1, h: 1, tone: 'image' },
      { x: 0.74, y: 0.88, w: 0.16, h: 0.05, tone: 'soft' },
    ],
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
    hint: 'titolo grande e un soggetto scontornato (una persona, un prodotto, un oggetto) che entra nella card dal basso',
    ground: 'primary',
    sketch: [
      { x: 0.1, y: 0.1, w: 0.26, h: 0.03, tone: 'accent' },
      ...headlineLines(0.18, [0.78, 0.62]),
      { x: 0.4, y: 0.48, w: 0.5, h: 0.52, tone: 'image' },
    ],
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
      { x: 0.1, y: 0.14, w: 0.44, h: 0.2, tone: 'accent' },
      ...headlineLines(0.42, [0.4, 0.34]),
      { x: 0.52, y: 0.38, w: 0.44, h: 0.62, tone: 'image' },
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
    hint: 'metà foto e metà testo: il titolo con una frase, o con due o tre punti',
    ground: 'ground',
    sketch: [
      { x: 0, y: 0, w: 1, h: 0.46, tone: 'image' },
      ...headlineLines(0.54, [0.74, 0.5]),
      { x: 0.1, y: 0.78, w: 0.62, h: 0.03, tone: 'soft' },
      { x: 0.1, y: 0.84, w: 0.5, h: 0.03, tone: 'soft' },
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
    hint: 'slide centrale del carosello: un punto con il suo numero',
    ground: 'ground',
    sketch: [
      { x: 0.1, y: 0.12, w: 0.2, h: 0.12, tone: 'accent' },
      ...headlineLines(0.34, [0.74, 0.5]),
      { x: 0.1, y: 0.56, w: 0.74, h: 0.03, tone: 'soft' },
      { x: 0.1, y: 0.62, w: 0.6, h: 0.03, tone: 'soft' },
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
    hint: 'ultima slide del carosello: la chiusura con un invito e la firma',
    ground: 'primary',
    sketch: [
      ...headlineLines(0.26, [0.72, 0.5]),
      { x: 0.1, y: 0.5, w: 0.6, h: 0.03, tone: 'soft' },
      { x: 0.1, y: 0.74, w: 0.16, h: 0.12, tone: 'accent' },
      { x: 0.27, y: 0.74, w: 0.16, h: 0.12, tone: 'soft' },
    ],
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
  return pages.map((page, index) => {
    const text = cleanCardText(page.text);
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

export function imageRoles(design: VisualDesign): ImageRole[] {
  const roles = new Set<ImageRole>();
  for (const page of design.pages) {
    const role = templateSpec(page.templateId).image;
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
  if (!previous || !proposed) return proposed;
  const created = previous.status === 'ready' || previous.status === 'creating';
  if (created && previous.pages.length === proposed.pages.length) return { ...previous, nextPages: proposed.pages };
  // La foto già fatta non si butta: con un formato diverso serve lo stesso.
  return previous.image.photo ? { ...proposed, image: previous.image } : proposed;
}

/** «Aggiorna il visivo»: i testi nuovi nei layout scelti, poi si ricompone. */
export function refreshDesign(current: VisualDesign): VisualDesign {
  if (!current.nextPages) return current;
  if (current.status === 'creating') throw new VisualBusyError();
  const pages = current.nextPages.map((page, i) => ({
    text: page.text,
    templateId: i === 0 ? (current.pages[0]?.templateId ?? page.templateId) : page.templateId,
  }));
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

/** I canali che aspettano il visivo prima di poter approvare. */
export function channelsWaitingForVisual(
  format: IdeaFormat,
  channels: readonly ChannelId[],
  design: VisualDesign | null | undefined,
): ChannelId[] {
  if (format === 'video' || design?.status === 'ready') return [];
  return channels.filter(needsMedia);
}

// ---------------------------------------------------------------------------
// Kit del brand
// ---------------------------------------------------------------------------

export interface BrandKit {
  name: string;
  colors: { primary: string; secondary: string; accent: string; ground: string };
  heading: FontFace;
  body: FontFace;
  /** Il foglio di Google Fonts con i pesi che servono. */
  fontsHref: string;
  logoUrl: string | null;
  signature: boolean;
  decoration: 'geometric' | 'none';
  treatment: 'natural' | 'desaturated';
}

export const DEFAULT_TYPOGRAPHY = TYPOGRAPHY_OPTIONS[0];

export function typographyOption(id: string | null | undefined) {
  return TYPOGRAPHY_OPTIONS.find((option) => option.id === id) ?? DEFAULT_TYPOGRAPHY;
}

export function googleFontsHref(faces: readonly FontFace[]): string {
  const weights = new Map<string, Set<number>>();
  for (const face of faces) weights.set(face.family, (weights.get(face.family) ?? new Set()).add(face.weight));
  const families = [...weights.entries()].map(
    ([family, set]) => `family=${family.replace(/ /g, '+')}:wght@${[...set].sort((a, b) => a - b).join(';')}`,
  );
  return `https://fonts.googleapis.com/css2?${families.join('&')}&display=swap`;
}

function hexOr(value: string, fallback: string): string {
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : fallback;
}

export function brandKit(brand: { identity: Pick<Brand['identity'], 'name'>; visual: Brand['visual'] }): BrandKit {
  const { visual } = brand;
  const [primary, secondary, accent, ground] = visual.palette.colors;
  // I brand salvati prima dei caratteri non hanno il campo: prendono la coppia di base.
  const type = typographyOption(visual.typography);
  return {
    name: brand.identity.name,
    colors: {
      primary: hexOr(primary, '#1C2150'),
      secondary: hexOr(secondary, '#2F3452'),
      accent: hexOr(accent, '#FF6B35'),
      ground: hexOr(ground, '#ECEEEF'),
    },
    heading: type.heading,
    body: type.body,
    fontsHref: googleFontsHref([type.heading, type.body, { family: type.body.family, weight: 600 }]),
    logoUrl: visual.logoUri,
    signature: visual.signature && Boolean(visual.logoUri),
    decoration: visual.imageStyle === 'flat-geometric' ? 'geometric' : 'none',
    treatment: visual.imageStyle === 'desaturated-photo' ? 'desaturated' : 'natural',
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

const INK_DARK = '#15171F';
const INK_LIGHT = '#FFFFFF';

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
