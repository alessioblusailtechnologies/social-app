import { describe, expect, it } from '@jest/globals';

import { addTheme, createThemes, MAX_THEMES, removeTheme, totalWeight } from '../themes';

describe('createThemes', () => {
  it('assegna pesi che sommano 100 e colori distinti', () => {
    for (let count = 1; count <= MAX_THEMES; count++) {
      const themes = createThemes(Array.from({ length: count }, (_, i) => `Tema ${i}`));
      expect(totalWeight(themes)).toBe(100);
      expect(new Set(themes.map((theme) => theme.color)).size).toBe(count);
    }
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
