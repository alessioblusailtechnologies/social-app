import { unavailableDirector, type ArtDirector } from '../ai/art-director';
import { unavailableCutout, type CutoutService } from './cutout';
import { unavailableFootage, type FootageAnalyzer } from './footage';
import { unavailableImages, type ImageGenerator } from './images';
import { unavailableMusic, type MusicGenerator } from './music';
import { unavailableRenderer, type CardRenderer } from './renderer';
import { unavailableStorage, type MediaStorage } from './storage';
import { unavailableVision, type VisionService } from './vision';

/** Quello che serve ai visivi: Storage, foto, scontorno, composizione e lettura delle immagini. Nei test sono finti. */
export interface MediaDeps {
  storage: MediaStorage;
  images: ImageGenerator;
  cutout: CutoutService;
  /** La musica dei video. */
  music: MusicGenerator;
  /** Cosa c'è nel materiale di chi pubblica: i momenti dei video, coi tempi. */
  footage: FootageAnalyzer;
  renderer: CardRenderer;
  vision: VisionService;
  /** Il direttore artistico della linea grafica: vede le immagini e decide la linea. */
  director: ArtDirector;
}

/** Senza configurazione: le card si modificano, crearle risponde 503. */
export const unavailableMedia: MediaDeps = {
  storage: unavailableStorage,
  images: unavailableImages,
  cutout: unavailableCutout,
  music: unavailableMusic,
  footage: unavailableFootage,
  renderer: unavailableRenderer,
  vision: unavailableVision,
  director: unavailableDirector,
};
