import { describe, expect, it } from '@jest/globals';

import { createStepLog, pageStep, searchStep } from '../ai-steps';
import type { AiStep } from '../types';

describe('pageStep', () => {
  it('chiama la home per nome e le altre pagine con l’ultimo pezzo dell’indirizzo', () => {
    expect(pageStep('https://www.Nodo.it/')).toEqual({ label: 'Apro la home', detail: 'nodo.it' });
    expect(pageStep('https://nodo.it/chi-siamo/?utm=x#team')).toEqual({
      label: 'Apro la pagina «Chi siamo»',
      detail: 'nodo.it/chi-siamo',
    });
    expect(pageStep('http://nodo.it/it/servizi/consulenza_ai.html').label).toBe('Apro la pagina «Consulenza ai»');
    expect(pageStep('https://nodo.it/caff%C3%A8-e-pane').label).toBe('Apro la pagina «Caffè e pane»');
  });

  it('accorcia i nomi lunghi e regge gli indirizzi rotti', () => {
    const { label } = pageStep(`https://nodo.it/${'parola-'.repeat(20)}fine`);
    expect(label.length).toBeLessThan(70);
    expect(label.endsWith('…»')).toBe(true);
    expect(pageStep('https://nodo.it/%E0%A4%A').label).toBe('Apro la pagina «%E0%A4%A»');
  });

  it('dice cosa cerca', () => {
    expect(searchStep('  forni   a Bologna ')).toEqual({ label: 'Cerco «forni a Bologna»' });
    expect(searchStep('')).toEqual({ label: 'Cerco sul web' });
  });
});

describe('createStepLog', () => {
  it('manda la lista intera a ogni cambio e tiene il passo di passaggio in fondo', () => {
    const seen: AiStep[][] = [];
    const log = createStepLog((steps) => seen.push(steps));

    log.start('thinking', 'Scelgo le pagine');
    log.drop('thinking');
    log.start('a', 'Apro la home', 'nodo.it');
    log.finish('a');
    log.start('b', 'Apro la pagina «Blog»');
    log.finish('b', { failed: true });
    log.start('thinking', 'Ragiono');
    log.finish('ignoto');
    log.drop('ignoto');

    expect(seen).toHaveLength(7);
    expect(seen.at(-1)).toEqual([
      { id: 'a', label: 'Apro la home', detail: 'nodo.it', status: 'done' },
      { id: 'b', label: 'Apro la pagina «Blog»', status: 'failed' },
      { id: 'thinking', label: 'Ragiono', status: 'running' },
    ]);
    // Ogni lista è nuova: chi la tiene nello stato vede il cambio.
    expect(seen[3]).not.toBe(seen[4]);
  });
});
