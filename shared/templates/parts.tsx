import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from 'react';

import { mixHex, type Aspect, type BrandKit, type KitFace } from '@shared/domain/visual';

import { useFontsReady } from './fonts';

/**
 * I pezzi della tavola, come nel generatore delle card di assieme: un fondo solo, la rubrica in alto a sinistra in
 * maiuscole spaziate, il blocco del testo, il piede con il filetto, la firma a sinistra e la pagina o l'indirizzo a
 * destra. Colori e caratteri vengono tutti dalla linea del brand (`kit.line`).
 */

/** Le immagini: `img` nell'app, `Img` di Remotion sul server, che aspetta il caricamento prima dello scatto. */
export const ImageElement = createContext<ElementType>('img');

export function faceStyle(face: KitFace): CSSProperties {
  return { fontFamily: face.stack, fontWeight: face.weight, fontStyle: face.italic ? 'italic' : 'normal' };
}

const SERIF = /Georgia, serif$/;

/** La voce: le frasi grandi. Il serif respira un po' di più, il bastone si stringe. */
export function voiceStyle(face: KitFace): CSSProperties {
  const serif = SERIF.test(face.stack);
  return { ...faceStyle(face), lineHeight: serif ? 1.14 : 1.08, letterSpacing: serif ? '-0.005em' : '-0.022em', margin: 0 };
}

export function alpha(hex: string, opacity: number): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/** La griglia della tavola sul formato vero: margini, dove sta la rubrica, dove si chiude il piede. */
export interface Grid {
  /** Scala dei corpi: i testi sono pensati a 1080 px, il formato orizzontale è basso. */
  k: number;
  side: number;
  top: number;
  bottom: number;
  /** Testo e immagine affiancati invece che uno sopra l'altro. */
  wide: boolean;
}

export function gridFor(aspect: Aspect): Grid {
  switch (aspect) {
    case '1:1':
      return { k: 1, side: 90, top: 84, bottom: 62, wide: false };
    case '9:16':
      // In alto e in basso l'interfaccia di TikTok e delle storie copre la card.
      return { k: 1, side: 96, top: 250, bottom: 380, wide: false };
    case '1.91:1':
      return { k: 0.6, side: 64, top: 44, bottom: 36, wide: true };
    default:
      return { k: 1, side: 90, top: 96, bottom: 74, wide: false };
  }
}

/** Il corpo della frase dalla sua lunghezza, come i punti scelti a mano per ogni tavola; poi `FitBlock` la fa entrare. */
export function voiceSize(text: string, k: number, cap = 108): number {
  const n = text.trim().length;
  const size = n <= 20 ? 108 : n <= 36 ? 94 : n <= 60 ? 78 : n <= 90 ? 66 : n <= 130 ? 56 : 48;
  return Math.min(size, cap) * k;
}

/**
 * Testo che si adatta al suo riquadro: parte dal corpo massimo e scende finché non entra, fino al minimo. Il
 * riquadro deve avere un'altezza (flex o misura), altrimenti cresce col testo. Dentro, le misure in `em` seguono il
 * corpo scelto.
 */
export function FitBlock({
  max,
  min,
  align = 'start',
  box,
  style,
  children,
}: {
  max: number;
  min: number;
  align?: 'start' | 'center' | 'end';
  box?: CSSProperties;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(max);
  // Letto per rimisurare quando arrivano i caratteri del brand.
  useFontsReady();

  // Senza dipendenze: si rimisura a ogni disegno, e si ferma quando il corpo non cambia più.
  useLayoutEffect(() => {
    const frame = outer.current;
    const node = inner.current;
    if (!frame || !node) return;
    let next = max;
    node.style.fontSize = `${next}px`;
    const overflows = () => node.offsetHeight > frame.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1;
    while (next > min && overflows()) {
      next = Math.max(min, next - Math.max(1, Math.round(next * 0.04)));
      node.style.fontSize = `${next}px`;
    }
    if (next !== size) setSize(next);
  });

  return (
    <div
      ref={outer}
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: align === 'end' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
        overflow: 'hidden',
        minHeight: 0,
        minWidth: 0,
        ...box,
      }}>
      {/* Il margine sotto tiene dentro i discendenti dell'ultima riga, che con l'interlinea stretta escono dalla riga. */}
      <div ref={inner} style={{ flex: 'none', overflowWrap: 'normal', paddingBottom: '0.14em', ...style, fontSize: size }}>
        {children}
      </div>
    </div>
  );
}

/** Rubrica, numeri, pagina: il carattere delle etichette, in maiuscolo, spaziato lettera per lettera se la linea lo vuole. */
export function Label({
  text,
  kit,
  size,
  color,
  upper = true,
  style,
}: {
  text: string;
  kit: BrandKit;
  size: number;
  color?: string;
  upper?: boolean;
  style?: CSSProperties;
}) {
  if (!text) return null;
  const { label, tones } = kit.line;
  return (
    <div
      style={{
        ...faceStyle(label),
        flex: 'none',
        fontSize: size,
        lineHeight: 1.2,
        letterSpacing: upper ? (label.spaced ? '0.42em' : '0.14em') : '0.04em',
        textTransform: upper ? 'uppercase' : 'none',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        color: color ?? tones.accent,
        ...style,
      }}>
      {text}
    </div>
  );
}

/** Una foto a tutto riquadro, con il trattamento del brand. Senza foto, una luce morbida nei colori della linea. */
export function Photo({ url, kit, position = 'center' }: { url: string | null; kit: BrandKit; position?: string }) {
  const Img = useContext(ImageElement);
  const { tones } = kit.line;
  if (!url) {
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(120% 90% at 70% 30%, ${mixHex(tones.accent, tones.ground, 0.35)}, ${mixHex(tones.ink, tones.ground, 0.9)} 70%)`,
        }}
      />
    );
  }
  const desaturated = kit.treatment === 'desaturated';
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <Img
        src={url}
        alt=""
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          objectFit: 'cover',
          objectPosition: position,
          filter: desaturated ? 'grayscale(1) contrast(1.08)' : 'saturate(0.94)',
        }}
      />
      {desaturated && (
        <div style={{ position: 'absolute', inset: 0, background: tones.ground, mixBlendMode: 'soft-light', opacity: 0.55 }} />
      )}
    </div>
  );
}

/**
 * La fascia fotografica delle aperture: la foto nasce dal fondo, piena in alto e velata in basso. In orizzontale sta
 * a destra e nasce dal fondo a sinistra.
 */
export function Band({ url, kit, size, side = false }: { url: string | null; kit: BrandKit; size: string; side?: boolean }) {
  const { ground } = kit.line.tones;
  return (
    <div
      style={{
        position: 'absolute',
        ...(side ? { top: 0, right: 0, bottom: 0, width: size } : { left: 0, right: 0, bottom: 0, height: size }),
        overflow: 'hidden',
      }}>
      <Photo url={url} kit={kit} position={side ? 'center' : 'center 62%'} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(to ${side ? 'right' : 'bottom'}, ${ground} 0%, ${alpha(ground, 0.62)} 30%, ${alpha(ground, 0.28)} 100%)`,
        }}
      />
    </div>
  );
}

/** Il soggetto scontornato, appoggiato al piede. */
export function Cutout({ url, kit, style }: { url: string | null; kit: BrandKit; style: CSSProperties }) {
  const Img = useContext(ImageElement);
  if (!url) return null;
  return (
    <Img
      src={url}
      alt=""
      style={{
        position: 'absolute',
        objectFit: 'contain',
        objectPosition: 'right bottom',
        filter: `${kit.treatment === 'desaturated' ? 'grayscale(1) contrast(1.06) ' : ''}drop-shadow(0 24px 40px rgba(0, 0, 0, 0.26))`,
        ...style,
      }}
    />
  );
}

/**
 * Il riquadro della tavola, coi margini del formato. Il fondo lo dipinge la card sotto ogni tavola: il riquadro resta
 * trasparente e lascia vedere fascia, foto e soggetto disegnati prima.
 */
export function Frame({ grid, children, style }: { grid: Grid; kit: BrandKit; children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        padding: `${grid.top}px ${grid.side}px ${grid.bottom}px`,
        ...style,
      }}>
      {children}
    </div>
  );
}

/** In alto: la rubrica a sinistra, se la linea la mostra, e sulle aperture senza piede la pagina a destra. */
export function Header({ kit, grid, kicker, page }: { kit: BrandKit; grid: Grid; kicker: string; page?: string }) {
  const rubric = kit.line.kicker ? kicker : '';
  if (!rubric && !page) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 24, flex: 'none', position: 'relative' }}>
      <Label text={rubric} kit={kit} size={23 * grid.k} style={{ minWidth: 0 }} />
      {page ? <Label text={page} kit={kit} size={21 * grid.k} color={kit.line.tones.muted} upper={false} /> : null}
    </div>
  );
}

/** Il marchio in basso a destra: il logo, o l'iniziale del brand in un quadrato d'inchiostro. */
function Mark({ kit, size }: { kit: BrandKit; size: number }) {
  const { tones, title, monogram } = kit.line;
  if (kit.signature && kit.logoUrl) return <LogoTile kit={kit} size={size} />;
  return (
    <span
      style={{
        ...faceStyle(title),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 'none',
        width: size,
        height: size,
        borderRadius: size * 0.16,
        background: tones.ink,
        color: tones.ground,
        fontSize: size * 0.62,
        fontStyle: 'normal',
        lineHeight: 1,
      }}>
      {monogram}
    </span>
  );
}

/** «2/5» nei caroselli, niente nei post singoli. */
export function pageLabel(pageIndex: number, pageCount: number): string {
  return pageCount > 1 ? `${pageIndex + 1}/${pageCount}` : '';
}

/** Il logo in piccolo, in una tessera chiara: si legge su ogni fondo, qualunque file sia. */
function LogoTile({ kit, size }: { kit: BrandKit; size: number }) {
  const Img = useContext(ImageElement);
  if (!kit.signature || !kit.logoUrl) return null;
  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 'none',
        width: size,
        height: size,
        borderRadius: size * 0.22,
        background: '#FFFFFF',
        overflow: 'hidden',
      }}>
      <Img src={kit.logoUrl} alt="" style={{ display: 'block', width: size * 0.84, height: size * 0.84, objectFit: 'contain' }} />
    </span>
  );
}

/**
 * Il piede, come lo vuole la linea: il filetto con la firma a sinistra (col logo, se c'è) e la pagina o l'indirizzo
 * a destra; oppure solo il marchio in basso a destra; oppure niente. La pagina dei caroselli c'è sempre.
 */
export function Footer({
  kit,
  grid,
  pageIndex,
  pageCount,
  rule = true,
  style,
}: {
  kit: BrandKit;
  grid: Grid;
  pageIndex: number;
  pageCount: number;
  rule?: boolean;
  style?: CSSProperties;
}) {
  const { tones, sign, signature, address, footer } = kit.line;
  const page = pageLabel(pageIndex, pageCount);
  const k = grid.k;
  if (footer !== 'rule') {
    if (footer === 'none' && !page) return null;
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 24,
          flex: 'none',
          marginTop: 36 * k,
          minHeight: 48 * k,
          position: 'relative',
          ...style,
        }}>
        {page ? <Label text={page} kit={kit} size={21 * k} color={tones.muted} upper={false} /> : <span />}
        {footer === 'mark' ? <Mark kit={kit} size={48 * k} /> : null}
      </div>
    );
  }
  const right = page || address;
  return (
    <div style={{ flex: 'none', marginTop: 36 * k, position: 'relative', ...style }}>
      {rule ? <div style={{ height: Math.max(1, 2 * k), background: tones.rule }} /> : null}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, marginTop: 22 * k, minHeight: 40 * k }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 * k, minWidth: 0 }}>
          <LogoTile kit={kit} size={40 * k} />
          <span
            style={{
              ...faceStyle(sign),
              fontSize: 28 * k,
              lineHeight: 1.2,
              color: tones.ink,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
            {signature}
          </span>
        </div>
        {right ? <Label text={right} kit={kit} size={21 * k} color={tones.muted} upper={false} /> : null}
      </div>
    </div>
  );
}
