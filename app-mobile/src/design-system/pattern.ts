import { createRng, pick } from '@shared/lib/random';

import { palette, shapeColors } from '@shared/design-system/tokens';

export type ShapeKind = 'circle' | 'half' | 'quarter' | 'leaf' | 'donut' | 'dot' | 'solid';

export type TileRotation = 0 | 90 | 180 | 270;

export interface Tile {
  kind: ShapeKind;
  color: string;
  ground: string;
  rotation: TileRotation;
}

const GROUNDS = [palette.white, palette.white, palette.grey100, palette.white];
const KINDS: ShapeKind[] = ['quarter', 'quarter', 'leaf', 'half', 'circle', 'quarter', 'leaf', 'donut', 'dot'];

/**
 * Stessa sequenza di estrazioni del PatternGrid HTML, quindi a parità di seed
 * la composizione coincide con quella del mock.
 */
export function composePattern(columns: number, rows: number, seed: number): Tile[] {
  const rand = createRng(seed);
  const tiles: Tile[] = [];
  for (let i = 0; i < columns * rows; i++) {
    const ground = pick(rand, GROUNDS);
    let color: string = pick(rand, shapeColors);
    // Regola del sistema: una forma non ha mai il colore del proprio fondo.
    if (color === ground) {
      const index = shapeColors.findIndex((shape) => shape === color);
      color = shapeColors[(index + 2) % shapeColors.length];
    }
    const kind = pick(rand, KINDS);
    const rotation = (Math.floor(rand() * 4) * 90) as TileRotation;
    tiles.push({ kind, color, ground, rotation });
  }
  return tiles;
}
