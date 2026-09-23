import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { services } from './index';
import type { AiStep, JobKind, OnAiSteps } from './types';

/**
 * Riprendere una generazione rimasta in corso.
 *
 * Le generazioni non vivono più dentro una richiesta: il backend le mette in coda e va avanti
 * da solo. Quindi chi riapre una schermata, o riporta l'app in primo piano dopo lo standby,
 * chiede «c'è un lavoro aperto su questo?» e si rimette a guardarlo da dov'è arrivato, invece
 * di ricominciare o di dire che è andata male.
 *
 * Il lavoro si ritrova per oggetto (`ref`: il contenuto, l'uscita, il brand, l'idea) o per
 * tipo, quando l'oggetto non c'è ancora, come nell'onboarding.
 */

export interface ResumeJob<T> {
  kind?: JobKind;
  ref?: string;
  /** Falso mentre lo sta già seguendo chi l'ha fatto partire: non si guarda due volte. */
  enabled?: boolean;
  onSteps: OnAiSteps;
  onDone: (result: T, kind: JobKind) => void;
  onError?: (error: unknown) => void;
}

/**
 * Cosa si sta riprendendo: `kind` dice dove mostrarne i passi, finché dura. `checked` diventa
 * vero appena si sa se c'era qualcosa da riprendere: chi fa partire una generazione da solo
 * (la schermata Idee, che ne propone appena si apre) deve aspettare quella risposta, o ne
 * farebbe partire una seconda mentre la prima è ancora in corso.
 */
export interface Resumed {
  resuming: boolean;
  kind: JobKind | null;
  checked: boolean;
}

export function useResumeJob<T>(options: ResumeJob<T>): Resumed {
  const [resumed, setResumed] = useState<Resumed>({ resuming: false, kind: null, checked: false });
  // Le funzioni cambiano a ogni render: si guardano qui, così non fanno ripartire la ricerca.
  const latest = useRef(options);
  const busy = useRef(false);

  useEffect(() => {
    latest.current = options;
  });

  const { kind, ref, enabled = true } = options;

  const look = useCallback(async () => {
    const current = latest.current;
    if (busy.current || current.enabled === false) return;
    if (!current.kind && !current.ref) return;
    busy.current = true;
    try {
      const open = await services.jobs.open({
        ...(current.kind ? { kind: current.kind } : {}),
        ...(current.ref ? { ref: current.ref } : {}),
      });
      if (!open) {
        setResumed({ resuming: false, kind: null, checked: true });
        return;
      }
      setResumed({ resuming: true, kind: open.kind, checked: true });
      current.onSteps(open.steps);
      const result = await services.jobs.follow<T>(open.id, (steps: AiStep[]) => latest.current.onSteps(steps));
      latest.current.onDone(result, open.kind);
    } catch (error) {
      latest.current.onError?.(error);
    } finally {
      busy.current = false;
      setResumed({ resuming: false, kind: null, checked: true });
    }
  }, []);

  // All'apertura della schermata e ogni volta che cambia l'oggetto guardato. La domanda parte
  // dopo il render, e se la schermata si chiude prima non parte affatto.
  useEffect(() => {
    if (!enabled) return undefined;
    const start = setTimeout(() => void look(), 0);
    return () => clearTimeout(start);
  }, [look, kind, ref, enabled]);

  // Al ritorno dallo standby: il lavoro è andato avanti mentre il telefono dormiva.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void look();
    });
    return () => subscription.remove();
  }, [look]);

  return resumed;
}
