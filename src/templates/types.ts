import type { Aspect, BrandKit, VisualPage } from '@/domain/visual';

/** Tutto quello che serve per disegnare una card: solo dati serializzabili, passano anche a una WebView. */
export interface CardProps {
  kit: BrandKit;
  page: VisualPage;
  /** Posizione nel carosello: con più pagine compaiono contatore e invito a scorrere. */
  pageIndex: number;
  pageCount: number;
  /** Indirizzi già risolti; nulli finché la foto o lo scontorno non ci sono. */
  photoUrl: string | null;
  cutoutUrl: string | null;
  aspect: Aspect;
  /** Chiamata quando la card è disegnata del tutto (caratteri, foto, testi adattati): la usa lo scatto di Remotion. */
  onReady?: () => void;
}
