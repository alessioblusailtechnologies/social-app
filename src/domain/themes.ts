import { createId } from '@/lib/id';

import type { Theme } from './brand';
import { THEME_COLORS } from './catalog';

export const WEIGHT_STEP = 5;
export const MAX_THEMES = 6;

const PRESET_WEIGHTS: Record<number, number[]> = {
  1: [100],
  2: [60, 40],
  3: [40, 35, 25],
  4: [40, 30, 20, 10],
  5: [30, 25, 20, 15, 10],
  6: [25, 20, 20, 15, 10, 10],
};

export function totalWeight(themes: readonly Theme[]): number {
  return themes.reduce((sum, theme) => sum + theme.weight, 0);
}

function nextColor(themes: readonly Theme[]): string {
  const used = new Set(themes.map((theme) => theme.color));
  return THEME_COLORS.find((color) => !used.has(color)) ?? THEME_COLORS[themes.length % THEME_COLORS.length];
}

/** Indice del tema più pesante (o più leggero) escluso `skip`. */
function extremeIndex(weights: number[], skip: number, mode: 'max' | 'min'): number {
  let found = -1;
  weights.forEach((weight, i) => {
    if (i === skip) return;
    if (found === -1) found = i;
    else if (mode === 'max' ? weight > weights[found] : weight < weights[found]) found = i;
  });
  return found;
}

/**
 * Porta il tema `index` al peso `target` e ribilancia gli altri a scatti di 5,
 * così la somma resta sempre 100: toglie ai temi più pesanti, restituisce ai più leggeri.
 */
export function setThemeWeight(themes: readonly Theme[], index: number, target: number): Theme[] {
  if (themes.length === 1) return [{ ...themes[0], weight: 100 }];
  const weights = themes.map((theme) => theme.weight);
  const clamped = Math.max(0, Math.min(100, Math.round(target / WEIGHT_STEP) * WEIGHT_STEP));
  let delta = clamped - weights[index];

  while (delta > 0) {
    const donor = extremeIndex(weights, index, 'max');
    if (weights[donor] < WEIGHT_STEP) break;
    weights[donor] -= WEIGHT_STEP;
    weights[index] += WEIGHT_STEP;
    delta -= WEIGHT_STEP;
  }
  while (delta < 0) {
    const receiver = extremeIndex(weights, index, 'min');
    weights[receiver] += WEIGHT_STEP;
    weights[index] -= WEIGHT_STEP;
    delta += WEIGHT_STEP;
  }
  return themes.map((theme, i) => ({ ...theme, weight: weights[i] }));
}

export function createThemes(names: readonly string[]): Theme[] {
  const list = names.slice(0, MAX_THEMES);
  const weights = PRESET_WEIGHTS[list.length] ?? [];
  const themes: Theme[] = [];
  list.forEach((name, i) => {
    themes.push({ id: createId('theme'), name, weight: weights[i], color: nextColor(themes) });
  });
  return themes;
}

/** Il nuovo tema riceve una quota equa, presa dai temi più pesanti. */
export function addTheme(themes: readonly Theme[], name = ''): Theme[] {
  if (themes.length >= MAX_THEMES) return [...themes];
  if (themes.length === 0) return createThemes([name]);
  const withNew = [...themes, { id: createId('theme'), name, weight: 0, color: nextColor(themes) }];
  const share = Math.floor(100 / withNew.length / WEIGHT_STEP) * WEIGHT_STEP;
  return setThemeWeight(withNew, withNew.length - 1, share);
}

/** Il peso del tema rimosso torna ai temi più leggeri. */
export function removeTheme(themes: readonly Theme[], index: number): Theme[] {
  const remaining = themes.filter((_, i) => i !== index);
  if (remaining.length === 0) return [];
  const weights = remaining.map((theme) => theme.weight);
  let freed = 100 - weights.reduce((sum, weight) => sum + weight, 0);
  while (freed > 0) {
    const receiver = extremeIndex(weights, -1, 'min');
    weights[receiver] += WEIGHT_STEP;
    freed -= WEIGHT_STEP;
  }
  return remaining.map((theme, i) => ({ ...theme, weight: weights[i] }));
}
