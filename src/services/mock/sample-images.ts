import type { BrandKit } from '@/domain/visual';
import { createRng, seedFromString } from '@/lib/random';

/**
 * Le immagini finte del mock: non c'è un modello d'immagine, quindi una «foto» di luci morbide
 * nei colori del brand e una sagoma già scontornata. Bastano a provare layout e flusso.
 */

const svgUri = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export function samplePhoto(kit: BrandKit, seed: string): string {
  const rng = createRng(seedFromString(seed));
  const { primary, secondary, accent, ground } = kit.colors;
  const lights = [accent, secondary, ground, primary]
    .map((color, i) => {
      const cx = Math.round(120 + rng() * 840);
      const cy = Math.round(160 + rng() * 1030);
      const r = Math.round(200 + rng() * 280);
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" opacity="${(0.5 + i * 0.12).toFixed(2)}"/>`;
    })
    .join('');
  return svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" preserveAspectRatio="xMidYMid slice">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${ground}"/><stop offset="1" stop-color="${secondary}"/></linearGradient>` +
      `<filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="90"/></filter></defs>` +
      `<rect width="1080" height="1350" fill="url(#g)"/><g filter="url(#b)">${lights}</g></svg>`,
  );
}

export function sampleCutout(): string {
  return svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000">` +
      `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#565C7C"/><stop offset="1" stop-color="#23263A"/></linearGradient></defs>` +
      `<circle cx="400" cy="300" r="170" fill="url(#s)"/><path d="M90 1000C90 700 230 540 400 540S710 700 710 1000Z" fill="url(#s)"/></svg>`,
  );
}
