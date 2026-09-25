import type { BrandKind } from '@/domain/brand';

import type { AiStep, OnAiSteps } from './types';

/**
 * I passi di una generazione, detti allo stesso modo dal backend (che li ricava dagli strumenti
 * che l'AI usa) e dal mock (che li simula). Chi guarda riceve ogni volta la lista intera.
 */

export interface StepLog {
  /** Apre un passo in fondo alla lista; uno con lo stesso id si sposta in fondo e riparte. */
  start(id: string, label: string, detail?: string): void;
  finish(id: string, outcome?: { failed?: boolean; detail?: string }): void;
  /** Toglie un passo di passaggio, come «Ragiono su quello che ho letto». */
  drop(id: string): void;
}

export function createStepLog(onSteps?: OnAiSteps): StepLog {
  let steps: AiStep[] = [];
  const update = (next: AiStep[]) => {
    steps = next;
    onSteps?.(steps);
  };
  return {
    start: (id, label, detail) =>
      update([...steps.filter((step) => step.id !== id), { id, label, ...(detail ? { detail } : {}), status: 'running' }]),
    finish: (id, { failed = false, detail } = {}) => {
      if (!steps.some((step) => step.id === id)) return;
      update(
        steps.map((step) =>
          step.id === id ? { ...step, status: failed ? 'failed' : 'done', ...(detail !== undefined && { detail }) } : step,
        ),
      );
    },
    drop: (id) => {
      if (steps.some((step) => step.id === id)) update(steps.filter((step) => step.id !== id));
    },
  };
}

/**
 * Due generazioni di fila che l'utente guarda come una: i passi della seconda si aggiungono sotto quelli della
 * prima, invece di sostituirli.
 */
export function stepsInSequence(onSteps?: OnAiSteps): { first: OnAiSteps; then: OnAiSteps } {
  let before: AiStep[] = [];
  return {
    first: (steps) => {
      before = steps;
      onSteps?.(steps);
    },
    then: (steps) => onSteps?.([...before, ...steps]),
  };
}

/** Il passo di passaggio fra uno strumento e l'altro: uno solo, sempre in fondo. */
export const THINKING_STEP = 'thinking';

/** Le parole della lettura del sito. */
export const WEBSITE_STEPS = {
  address: 'Controllo l’indirizzo',
  colors: 'Cerco i colori nel codice del sito',
  plan: 'Scelgo le pagine da leggere',
  reflect: 'Ragiono su quello che ho letto',
} as const;

/** Le parole di obiettivi e pubblico, per tipo di brand. */
export const POSITIONING_STEPS: Record<BrandKind, { goals: string; audiences: string }> = {
  person: { goals: 'Penso a perché pubblichi', audiences: 'Cerco chi vuoi raggiungere' },
  company: { goals: 'Penso a perché pubblicate', audiences: 'Cerco chi volete raggiungere' },
  client: { goals: 'Penso a perché pubblica', audiences: 'Cerco chi vuole raggiungere' },
};

/** Le parole dello stile delle card: riferimenti, scelta, una card per canale. */
export const VISUAL_STEPS = {
  references: (count: number) =>
    count === 0
      ? 'Parto da palette, sito e indicazioni'
      : `Guardo ${count === 1 ? 'l’immagine' : `le ${count} immagini`} di riferimento`,
  look: 'Studio caratteri, spazi e foto dei riferimenti',
  line: 'Disegno la linea: fondo, caratteri, firma e rubriche',
  templates: 'Scrivo i template delle card del brand',
  thinking: 'Guardo i riferimenti e ragiono: ci vuole qualche minuto',
  refine: 'Correggo la linea',
  photos: (count: number) => (count === 1 ? 'Preparo la foto' : `Preparo ${count} foto`),
  keepPhotos: 'Tengo le foto di prima',
  editPhotos: 'Ritocco le foto di prima',
  card: (channel: string) => `Compongo la card per ${channel}`,
} as const;

/** Le parole del profilo video: come si racconta il brand nei reel. */
export const VIDEO_PROFILE_STEPS = {
  thinking: 'Penso a come si racconta il brand in video',
  reflect: 'Ragiono su cosa mostrare vero e cosa si può generare',
  done: 'Profilo video pronto',
} as const;

/** Le parole del montaggio: la regia, la sala di montaggio, il video consegnato. */
export const VIDEO_CUT_STEPS = {
  thinking: 'Leggo la regia e preparo il montaggio',
  reflect: 'Ragiono sul montaggio',
  done: (placeholders: number) =>
    placeholders === 0 ? 'Video montato' : `Video montato, ${placeholders === 1 ? 'una scena aspetta' : `${placeholders} scene aspettano`} il materiale`,
} as const;

/** Le parole di «Non posso girarla»: la scena rifatta con un'altra strada. */
export const VIDEO_SCENE_STEPS = {
  thinking: 'Ripenso la scena senza il girato',
  reflect: 'Ragiono su cosa mostrare al suo posto',
  done: (kind: string) => `Scena rifatta: ${kind}`,
} as const;

/** Le parole del b-roll: prima il fotogramma, poi la clip. */
export const BROLL_STEPS = {
  frame: 'Penso al fotogramma della scena',
  clip: 'Penso a come si muove la scena',
  reflect: 'Controllo che sia quello che serve',
  frameDone: 'Fotogramma pronto',
  clipDone: 'Clip pronta',
} as const;

/** Le parole della musica del brand: il piano, poi una traccia alla volta. */
export const MUSIC_STEPS = {
  plan: 'Penso alla musica del brand',
  reflect: 'Ragiono su atmosfere e velocità',
  track: (mood: string) => `Compongo «${shorten(mood, MAX_NAME)}»`,
} as const;

/** Le parole delle idee proposte dal Brand DNA. */
export const IDEAS_STEPS = {
  context: (name: string) => (name.trim() ? `Rileggo il profilo di ${name.trim()}` : 'Rileggo il profilo del brand'),
  plan: 'Cerco spunti su temi, date e notizie',
  reflect: 'Ragiono su quello che ho trovato',
  write: (count: number) => `Scrivo ${count === 1 ? 'l’idea' : `${count} idee`}`,
} as const;

/** Le parole della scrittura di una bozza: il profilo, la fonte, poi un testo per canale. */
export const WRITING_STEPS = {
  context: (name: string) => (name.trim() ? `Rileggo il profilo di ${name.trim()}` : 'Rileggo il profilo del brand'),
  basis: (title: string) => `Parto da «${shorten(title.replace(/\s+/g, ' ').trim(), MAX_NAME)}»`,
  plan: 'Cerco l’appiglio giusto',
  reflect: 'Ragiono su quello che ho letto',
  write: (channels: string) => `Scrivo per ${channels}`,
  visual: 'Penso al visivo che accompagna il testo',
} as const;

/** Le parole di un ritocco chiesto dall'utente. */
export const REWRITE_STEPS = {
  read: (channel: string) => `Rileggo il testo per ${channel}`,
  ask: (instruction: string) => `Capisco cosa cambiare: «${shorten(instruction.replace(/\s+/g, ' ').trim(), MAX_NAME)}»`,
  write: 'Riscrivo tenendo la tua voce',
} as const;

/** Il primo passo dice da cosa parto: il sito letto o la frase scritta. */
export function contextStep(site: string | null, known: string): { label: string; detail: string } {
  return {
    label: site ? `Rileggo quello che ho letto su ${site}` : 'Rileggo quello che mi hai scritto',
    detail: shorten(known.replace(/\s+/g, ' ').trim(), 90),
  };
}

/** «Ne propongo 5, scelgo «a» e «b»» */
export function pickedDetail(count: number, picked: readonly string[]): string {
  const marks = picked.map((item) => `«${item}»`);
  const list = marks.length > 1 ? `${marks.slice(0, -1).join(', ')} e ${marks[marks.length - 1]}` : (marks[0] ?? '');
  return `Ne propongo ${count}, scelgo ${list}`;
}

export function colorsFound(count: number): string {
  if (count === 0) return 'Nessuno nel codice: la palette la propongo io';
  return count === 1 ? 'Trovato un colore' : `Trovati ${count} colori`;
}

const MAX_NAME = 48;

function shorten(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** "https://www.nodo.it/chi-siamo/?x=1" → «Apro la pagina Chi siamo», nodo.it/chi-siamo. */
export function pageStep(url: string): { label: string; detail: string } {
  const address = url
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');
  const [host = '', ...path] = address.split('/');
  const segments = path.filter(Boolean);
  const detail = [host.toLowerCase(), ...segments].join('/');
  if (segments.length === 0) return { label: 'Apro la home', detail };
  const name = decode(segments[segments.length - 1])
    .replace(/\.(html?|php|aspx?)$/i, '')
    .replace(/[-_+\s]+/g, ' ')
    .trim();
  if (!name) return { label: 'Apro una pagina', detail };
  return { label: `Apro la pagina «${shorten(name.charAt(0).toUpperCase() + name.slice(1), MAX_NAME)}»`, detail };
}

export function searchStep(query: string): { label: string; detail?: string } {
  const text = query.replace(/\s+/g, ' ').trim();
  return text ? { label: `Cerco «${shorten(text, MAX_NAME)}»` } : { label: 'Cerco sul web' };
}
