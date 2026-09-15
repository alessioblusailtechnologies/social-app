import { describe, expect, it } from '@jest/globals';

import { addTheme, createThemes, MAX_THEMES, removeTheme, setThemeWeight, totalWeight } from '../themes';

const weights = (themes: { weight: number }[]) => themes.map((theme) => theme.weight);

describe('createThemes', () => {
  it('assegna pesi che sommano 100 e colori distinti', () => {
    for (let count = 1; count <= MAX_THEMES; count++) {
      const themes = createThemes(Array.from({ length: count }, (_, i) => `Tema ${i}`));
      expect(totalWeight(themes)).toBe(100);
      expect(new Set(themes.map((theme) => theme.color)).size).toBe(count);
    }
  });
});

describe('setThemeWeight', () => {
  const base = createThemes(['A', 'B', 'C', 'D']); // 40 30 20 10

  it('aumentando un tema toglie al più pesante degli altri', () => {
    expect(weights(setThemeWeight(base, 3, 15))).toEqual([35, 30, 20, 15]);
  });

  it('diminuendo un tema restituisce al più leggero degli altri', () => {
    expect(weights(setThemeWeight(base, 0, 35))).toEqual([35, 30, 20, 15]);
  });

  it('mantiene la somma a 100 anche con salti ampi', () => {
    const result = setThemeWeight(base, 2, 100);
    expect(weights(result)).toEqual([0, 0, 100, 0]);
    expect(totalWeight(setThemeWeight(result, 2, 0))).toBe(100);
  });

  it('con un solo tema il peso resta 100', () => {
    expect(weights(setThemeWeight(createThemes(['Solo']), 0, 40))).toEqual([100]);
  });
});

describe('addTheme e removeTheme', () => {
  it('il nuovo tema riceve una quota equa e la somma resta 100', () => {
    const result = addTheme(createThemes(['A', 'B', 'C', 'D']), 'E');
    expect(result).toHaveLength(5);
    expect(result[4].weight).toBe(20);
    expect(totalWeight(result)).toBe(100);
  });

  it('non supera il massimo di temi', () => {
    const full = createThemes(Array.from({ length: MAX_THEMES }, (_, i) => `T${i}`));
    expect(addTheme(full)).toHaveLength(MAX_THEMES);
  });

  it('rimuovendo un tema il suo peso torna agli altri', () => {
    const result = removeTheme(createThemes(['A', 'B', 'C', 'D']), 0);
    expect(result).toHaveLength(3);
    expect(totalWeight(result)).toBe(100);
  });
});
