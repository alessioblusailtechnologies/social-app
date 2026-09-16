import { unavailableCutout, type CutoutService } from './cutout';
import { unavailableImages, type ImageGenerator } from './images';
import { unavailableRenderer, type CardRenderer } from './renderer';
import { unavailableStorage, type MediaStorage } from './storage';

/** Quello che serve ai visivi: Storage, foto, scontorno e composizione. Nei test sono finti. */
export interface MediaDeps {
  storage: MediaStorage;
  images: ImageGenerator;
  cutout: CutoutService;
  renderer: CardRenderer;
}

/** Senza configurazione: le card si modificano, crearle risponde 503. */
export const unavailableMedia: MediaDeps = {
  storage: unavailableStorage,
  images: unavailableImages,
  cutout: unavailableCutout,
  renderer: unavailableRenderer,
};
