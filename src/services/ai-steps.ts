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
  style: 'Scelgo caratteri e stile delle card',
  card: (channel: string) => `Compongo la card per ${channel}`,
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
