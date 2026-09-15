import { describe, expect, it } from '@jest/globals';

import { composePattern } from '@/design-system/pattern';

import { parseItalianDate } from '../dates';
import { createRng, sample, seedFromString } from '../random';

describe('random', () => {
  it('a parità di seed produce la stessa sequenza', () => {
    const a = createRng(19);
    const b = createRng(19);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('i seed ricavati da stringhe sono stabili e piccoli', () => {
    expect(seedFromString('nodo.it')).toBe(seedFromString('nodo.it'));
    expect(seedFromString('nodo.it')).toBeLessThanOrEqual(99991);
  });

  it('sample non ripete elementi', () => {
    const picked = sample(createRng(3), ['a', 'b', 'c', 'd'], 4);
    expect(new Set(picked).size).toBe(4);
  });
});

describe('composePattern', () => {
  it('è deterministico e non mette mai una forma sul proprio colore di fondo', () => {
    const tiles = composePattern(6, 3, 19);
    expect(tiles).toEqual(composePattern(6, 3, 19));
    expect(tiles).toHaveLength(18);
    for (const tile of tiles) expect(tile.color).not.toBe(tile.ground);
  });
});

describe('parseItalianDate', () => {
  it('accetta GG/MM/AAAA e rifiuta date inesistenti', () => {
    expect(parseItalianDate('3/10/2024')).toBe('2024-10-03');
    expect(parseItalianDate('31/02/2024')).toBeNull();
    expect(parseItalianDate('ottobre')).toBeNull();
  });
});
