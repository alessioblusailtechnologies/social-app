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

import { SAFE_AREAS, contrastRatio, isDark, type Aspect, type BrandKit } from '@/domain/visual';

import { useFontsReady } from './fonts';

/** Le immagini: `img` nell'app, `Img` di Remotion sul server, che aspetta il caricamento prima dello scatto. */
export const ImageElement = createContext<ElementType>('img');

const SERIF = /serif|playfair|fraunces/i;

function family(face: BrandKit['heading']): string {
  return `"${face.family}", ${SERIF.test(face.family) ? 'Georgia, serif' : 'system-ui, sans-serif'}`;
}

export function headingFont(kit: BrandKit): CSSProperties {
  return {
    fontFamily: family(kit.heading),
    fontWeight: kit.heading.weight,
    letterSpacing: SERIF.test(kit.heading.family) ? '-0.01em' : '-0.025em',
  };
}

export function bodyFont(kit: BrandKit): CSSProperties {
  return { fontFamily: family(kit.body), fontWeight: 400 };
}

/** I testi si disegnano a 1080 px di larghezza; in orizzontale la card è bassa e scala tutto. */
export function textScale(aspect: Aspect): number {
  if (aspect === '1.91:1') return 0.6;
  if (aspect === '1:1') return 0.9;
  return 1;
}

export function alpha(hex: string, opacity: number): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/** Un colore del brand che si distingue dal fondo, per le forme. */
export function shapeColor(kit: BrandKit, background: string, order: (keyof BrandKit['colors'])[]): string {
  for (const key of order) {
    if (contrastRatio(kit.colors[key], background) >= 1.35) return kit.colors[key];
  }
  return isDark(background) ? '#FFFFFF' : '#15171F';
}

/**
 * Testo che si adatta al suo riquadro: parte dal corpo massimo e scende finché non entra,
 * fino al minimo. Il riquadro deve avere un'altezza (flex o misura), altrimenti cresce col testo.
 * Dentro i figli le misure in `em` seguono il corpo scelto.
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

export type ShapeKind = 'circle' | 'half' | 'quarter' | 'leaf' | 'donut' | 'dot';

/** Le forme del sistema geometrico, come nel PatternGrid dell'app. Mai un simbolo con un significato. */
export function Shape({
  kind,
  color,
  size,
  rotate = 0,
  style,
}: {
  kind: ShapeKind;
  color: string;
  size: number | string;
  rotate?: number;
  style?: CSSProperties;
}) {
  let shape: ReactNode;
  switch (kind) {
    case 'circle':
      shape = <circle cx={50} cy={50} r={50} fill={color} />;
      break;
    case 'dot':
      shape = <circle cx={50} cy={50} r={20} fill={color} />;
      break;
    case 'donut':
      shape = <path fillRule="evenodd" fill={color} d="M50 0a50 50 0 1 1 0 100a50 50 0 1 1 0-100zm0 27a23 23 0 1 0 0 46a23 23 0 1 0 0-46z" />;
      break;
    case 'quarter':
      shape = <path fill={color} d="M0 100A100 100 0 0 1 100 0V100Z" />;
      break;
    case 'leaf':
      shape = <path fill={color} d="M0 100A100 100 0 0 1 100 0A100 100 0 0 1 0 100Z" />;
      break;
    case 'half':
      shape = <path fill={color} d="M0 100V50A50 50 0 0 1 100 50V100Z" />;
      break;
  }
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      aria-hidden
      style={{ display: 'block', flex: 'none', transform: rotate ? `rotate(${rotate}deg)` : undefined, ...style }}>
      {shape}
    </svg>
  );
}

/** Una foto a tutto riquadro, con il trattamento del brand. Senza foto, un fondo neutro coi colori del brand. */
export function Photo({ url, kit, position = 'center' }: { url: string | null; kit: BrandKit; position?: string }) {
  const Img = useContext(ImageElement);
  if (!url) {
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(145deg, ${alpha(kit.colors.secondary, 0.55)}, ${alpha(kit.colors.primary, 0.85)})`,
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
          filter: desaturated ? 'grayscale(1) contrast(1.08)' : 'saturate(0.96)',
        }}
      />
      {desaturated && (
        <div style={{ position: 'absolute', inset: 0, background: kit.colors.primary, mixBlendMode: 'soft-light', opacity: 0.6 }} />
      )}
    </div>
  );
}

/** Il soggetto scontornato, appoggiato al bordo in basso. */
export function Cutout({ url, kit, style }: { url: string | null; kit: BrandKit; style: CSSProperties }) {
  const Img = useContext(ImageElement);
  if (!url) return null;
  return (
    <Img
      src={url}
      alt=""
      style={{
        position: 'absolute',
        bottom: 0,
        objectFit: 'contain',
        objectPosition: 'right bottom',
        filter: `${kit.treatment === 'desaturated' ? 'grayscale(1) contrast(1.06) ' : ''}drop-shadow(0 28px 44px rgba(0, 0, 0, 0.28))`,
        ...style,
      }}
    />
  );
}

/** Il riquadro della card, con i margini di sicurezza del formato. */
export function Frame({
  aspect,
  background,
  children,
  style,
}: {
  aspect: Aspect;
  background: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const safe = SAFE_AREAS[aspect];
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        padding: `${safe.top}px ${safe.right}px ${safe.bottom}px ${safe.left}px`,
        background,
        ...style,
      }}>
      {children}
    </div>
  );
}

export function Kicker({ text, color, kit, scale, style }: { text: string; color: string; kit: BrandKit; scale: number; style?: CSSProperties }) {
  if (!text) return null;
  return (
    <div
      style={{
        ...bodyFont(kit),
        flex: 'none',
        fontWeight: 600,
        fontSize: 30 * scale,
        lineHeight: 1.2,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        color,
        ...style,
      }}>
      {text}
    </div>
  );
}

/** Il logo del brand: su un fondo scuro sta dentro una capsula chiara, così si legge sempre. */
export function Logo({ kit, background, height }: { kit: BrandKit; background: string; height: number }) {
  const Img = useContext(ImageElement);
  if (!kit.signature || !kit.logoUrl) return null;
  const chip = isDark(background);
  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        flex: 'none',
        padding: chip ? `${height * 0.16}px ${height * 0.22}px` : 0,
        borderRadius: height * 0.26,
        background: chip ? '#FFFFFF' : 'transparent',
      }}>
      <Img
        src={kit.logoUrl}
        alt=""
        style={{ display: 'block', height: chip ? height * 0.68 : height, maxWidth: height * 3.6, objectFit: 'contain' }}
      />
    </span>
  );
}

/** In fondo alla card: a sinistra il contatore del carosello, a destra la firma. */
export function Footer({
  kit,
  ink,
  background,
  pageIndex,
  pageCount,
  scale,
  logo = true,
}: {
  kit: BrandKit;
  ink: string;
  background: string;
  pageIndex: number;
  pageCount: number;
  scale: number;
  logo?: boolean;
}) {
  const label = pageCount > 1 ? (pageIndex === 0 ? 'Scorri →' : `${pageIndex + 1} / ${pageCount}`) : '';
  const showLogo = logo && kit.signature && Boolean(kit.logoUrl);
  if (!label && !showLogo) return null;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 24,
        flex: 'none',
        height: 72 * scale,
        marginTop: 32 * scale,
      }}>
      <span style={{ ...bodyFont(kit), fontWeight: 600, fontSize: 28 * scale, color: ink, opacity: 0.72, letterSpacing: '0.02em' }}>
        {label}
      </span>
      {showLogo && <Logo kit={kit} background={background} height={64 * scale} />}
    </div>
  );
}
