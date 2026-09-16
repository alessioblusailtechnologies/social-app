import type { CSSProperties, ReactElement } from 'react';

import { SAFE_AREAS, accentOn, contrastRatio, inkOn, type TemplateId } from '@/domain/visual';

import {
  Cutout,
  FitBlock,
  Footer,
  Frame,
  Kicker,
  Logo,
  Photo,
  Shape,
  alpha,
  bodyFont,
  headingFont,
  shapeColor,
  textScale,
} from './parts';
import type { CardProps } from './types';

/**
 * I layout delle card. Ogni layout sceglie il suo fondo tra i colori del brand e ricava
 * l'inchiostro dal contrasto: nessun colore è scritto a mano.
 */

const HEADLINE: CSSProperties = { lineHeight: 1.04, margin: 0 };

/** Le forme sotto il testo: una fila di moduli, o una riga d'accento se il brand non usa il geometrico. */
function Accents({ kit, background, scale, compact }: Pick<CardProps, 'kit'> & { background: string; scale: number; compact?: boolean }) {
  if (kit.decoration !== 'geometric') {
    return <div style={{ width: 120 * scale, height: 10 * scale, borderRadius: 5 * scale, background: accentOn(background, kit), flex: 'none' }} />;
  }
  const size = (compact ? 68 : 96) * scale;
  return (
    <div style={{ display: 'flex', flex: 'none' }}>
      <Shape kind="quarter" size={size} color={shapeColor(kit, background, ['accent', 'secondary', 'ground'])} />
      <Shape kind="leaf" size={size} color={shapeColor(kit, background, ['secondary', 'ground', 'accent'])} />
      <Shape kind="circle" size={size} color={shapeColor(kit, background, ['ground', 'accent', 'secondary'])} />
    </div>
  );
}

function Statement({ kit, page, aspect, pageIndex, pageCount }: CardProps) {
  const { text } = page;
  const k = textScale(aspect);
  const bg = kit.colors.primary;
  const ink = inkOn(bg, kit);
  return (
    <Frame aspect={aspect} background={bg}>
      <Kicker text={text.kicker} color={accentOn(bg, kit)} kit={kit} scale={k} />
      <FitBlock max={118 * k} min={50 * k} align="end" box={{ flex: 1, marginTop: 24 * k }} style={{ ...headingFont(kit), ...HEADLINE, color: ink }}>
        {text.headline}
      </FitBlock>
      {text.body ? (
        <FitBlock
          max={40 * k}
          min={26 * k}
          box={{ flex: 'none', height: (aspect === '1.91:1' ? 120 : 190) * k, marginTop: 28 * k }}
          style={{ ...bodyFont(kit), color: ink, opacity: 0.84, lineHeight: 1.35 }}>
          {text.body}
        </FitBlock>
      ) : null}
      <div style={{ marginTop: 36 * k }}>
        <Accents kit={kit} background={bg} scale={k} compact={aspect === '1.91:1'} />
      </div>
      <Footer kit={kit} ink={ink} background={bg} pageIndex={pageIndex} pageCount={pageCount} scale={k} />
    </Frame>
  );
}

/** Il fondo per un numero in accento: chiaro se l'accento ci si legge, altrimenti il principale. */
function valueGround(kit: CardProps['kit']): string {
  return contrastRatio(kit.colors.accent, kit.colors.ground) >= 3 ? kit.colors.ground : kit.colors.primary;
}

function Stat({ kit, page, aspect, pageIndex, pageCount }: CardProps) {
  const { text } = page;
  const k = textScale(aspect);
  const bg = valueGround(kit);
  const ink = inkOn(bg, kit);
  return (
    <Frame aspect={aspect} background={bg}>
      {kit.decoration === 'geometric' && (
        <Shape
          kind="quarter"
          rotate={-90}
          size={300 * k}
          color={alpha(shapeColor(kit, bg, ['secondary', 'accent']), 0.9)}
          style={{ position: 'absolute', top: 0, right: 0 }}
        />
      )}
      <Kicker text={text.kicker} color={ink} kit={kit} scale={k} style={{ opacity: 0.8, position: 'relative' }} />
      <div style={{ flex: 1 }} />
      <FitBlock
        max={330 * k}
        min={110 * k}
        align="end"
        box={{ flex: 'none', height: '30%', position: 'relative' }}
        style={{ ...headingFont(kit), color: accentOn(bg, kit), lineHeight: 0.92, letterSpacing: '-0.045em', whiteSpace: 'nowrap' }}>
        {text.value}
      </FitBlock>
      <FitBlock
        max={78 * k}
        min={40 * k}
        box={{ flex: '0 1 auto', maxHeight: '30%', marginTop: 28 * k }}
        style={{ ...headingFont(kit), ...HEADLINE, lineHeight: 1.08, color: ink }}>
        {text.headline}
      </FitBlock>
      {text.body ? (
        <FitBlock
          max={36 * k}
          min={24 * k}
          box={{ flex: '0 1 auto', maxHeight: '14%', marginTop: 20 * k }}
          style={{ ...bodyFont(kit), color: ink, opacity: 0.76, lineHeight: 1.35 }}>
          {text.body}
        </FitBlock>
      ) : null}
      <Footer kit={kit} ink={ink} background={bg} pageIndex={pageIndex} pageCount={pageCount} scale={k} />
    </Frame>
  );
}

function List({ kit, page, aspect, pageIndex, pageCount }: CardProps) {
  const { text } = page;
  const k = textScale(aspect);
  const bg = kit.colors.ground;
  const ink = inkOn(bg, kit);
  const marker = shapeColor(kit, bg, ['accent', 'primary', 'secondary']);
  const items = text.items.filter((item) => item.body || item.title);
  // In orizzontale titolo e punti stanno affiancati, altrimenti i punti non entrano.
  const wide = aspect === '1.91:1';
  return (
    <Frame aspect={aspect} background={bg}>
      <Kicker text={text.kicker} color={ink} kit={kit} scale={k} style={{ opacity: 0.72 }} />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: wide ? 'row' : 'column', gap: wide ? 56 : 0, marginTop: 20 * k }}>
      <FitBlock
        max={wide ? 68 : 88 * k}
        min={wide ? 34 : 44 * k}
        box={wide ? { flex: '0 0 44%' } : { flex: '0 1 auto', maxHeight: '34%' }}
        style={{ ...headingFont(kit), ...HEADLINE, lineHeight: 1.06, color: ink }}>
        {text.headline}
      </FitBlock>
      <FitBlock
        max={wide ? 34 : 48 * k}
        min={wide ? 20 : 24 * k}
        align={wide ? 'center' : 'start'}
        box={{ flex: 1, marginTop: wide ? 0 : 52 * k }}
        style={{ ...bodyFont(kit), color: ink, lineHeight: 1.28 }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: 'flex', gap: '0.7em', alignItems: 'flex-start', marginBottom: i < items.length - 1 ? '0.85em' : 0 }}>
            {kit.decoration === 'geometric' ? (
              <Shape kind={i % 2 ? 'leaf' : 'quarter'} size="0.78em" color={marker} style={{ marginTop: '0.2em' }} />
            ) : (
              <span style={{ width: '0.42em', height: '0.42em', borderRadius: '50%', background: marker, flex: 'none', marginTop: '0.42em' }} />
            )}
            <span style={{ flex: 1, minWidth: 0 }}>
              {item.title && item.body ? (
                <>
                  <b style={{ fontWeight: 600 }}>{item.title}</b>
                  <br />
                  <span style={{ opacity: 0.8 }}>{item.body}</span>
                </>
              ) : (
                item.body || item.title
              )}
            </span>
          </div>
        ))}
      </FitBlock>
      </div>
      <Footer kit={kit} ink={ink} background={bg} pageIndex={pageIndex} pageCount={pageCount} scale={k} />
    </Frame>
  );
}

function Steps({ kit, page, aspect, pageIndex, pageCount }: CardProps) {
  const { text } = page;
  const k = textScale(aspect);
  const bg = kit.colors.ground;
  const ink = inkOn(bg, kit);
  const badge = shapeColor(kit, bg, ['accent', 'primary']);
  const items = text.items.filter((item) => item.title || item.body).slice(0, 4);
  const wide = aspect === '1.91:1';
  return (
    <Frame aspect={aspect} background={bg}>
      <Kicker text={text.kicker} color={ink} kit={kit} scale={k} style={{ opacity: 0.72 }} />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: wide ? 'row' : 'column', gap: wide ? 56 : 0, marginTop: 20 * k }}>
      <FitBlock
        max={wide ? 64 : 84 * k}
        min={wide ? 32 : 42 * k}
        box={wide ? { flex: '0 0 40%' } : { flex: '0 1 auto', maxHeight: '28%' }}
        style={{ ...headingFont(kit), ...HEADLINE, lineHeight: 1.06, color: ink }}>
        {text.headline}
      </FitBlock>
      <FitBlock
        max={wide ? 30 : 42 * k}
        min={wide ? 18 : 22 * k}
        align={wide ? 'center' : 'start'}
        box={{ flex: 1, marginTop: wide ? 0 : 52 * k }}
        style={{ ...bodyFont(kit), color: ink, lineHeight: 1.3 }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: 'flex', gap: '0.8em', marginBottom: i < items.length - 1 ? '0.9em' : 0 }}>
            <span
              style={{
                ...headingFont(kit),
                letterSpacing: 0,
                flex: 'none',
                width: '1.9em',
                height: '1.9em',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: badge,
                color: inkOn(badge, kit),
              }}>
              {i + 1}
            </span>
            <span style={{ flex: 1, minWidth: 0, paddingTop: '0.2em' }}>
              {item.title ? <b style={{ fontWeight: 600, display: 'block' }}>{item.title}</b> : null}
              {item.body ? <span style={{ display: 'block', opacity: 0.8, marginTop: '0.15em' }}>{item.body}</span> : null}
            </span>
          </div>
        ))}
      </FitBlock>
      </div>
      <Footer kit={kit} ink={ink} background={bg} pageIndex={pageIndex} pageCount={pageCount} scale={k} />
    </Frame>
  );
}

function Quote({ kit, page, aspect, pageIndex, pageCount }: CardProps) {
  const { text } = page;
  const k = textScale(aspect);
  const bg = kit.colors.primary;
  const ink = inkOn(bg, kit);
  const accent = accentOn(bg, kit);
  return (
    <Frame aspect={aspect} background={bg}>
      <div style={{ ...headingFont(kit), flex: 'none', height: 150 * k, fontSize: 280 * k, lineHeight: 0.9, color: accent }}>“</div>
      <FitBlock max={84 * k} min={38 * k} align="center" box={{ flex: 1, marginTop: 12 * k }} style={{ ...headingFont(kit), ...HEADLINE, lineHeight: 1.14, color: ink }}>
        {text.body}
      </FitBlock>
      <div style={{ display: 'flex', alignItems: 'center', gap: 28 * k, marginTop: 40 * k, flex: 'none' }}>
        <span style={{ width: 64 * k, height: 8 * k, borderRadius: 4 * k, background: accent, flex: 'none' }} />
        <span style={{ ...bodyFont(kit), minWidth: 0, color: ink, lineHeight: 1.25 }}>
          <b style={{ fontWeight: 600, fontSize: 36 * k, display: 'block' }}>{text.author}</b>
          {text.kicker ? <span style={{ fontSize: 28 * k, opacity: 0.72, display: 'block' }}>{text.kicker}</span> : null}
        </span>
      </div>
      <Footer kit={kit} ink={ink} background={bg} pageIndex={pageIndex} pageCount={pageCount} scale={k} />
    </Frame>
  );
}

function PhotoCover({ kit, page, aspect, pageIndex, pageCount, photoUrl }: CardProps) {
  const { text } = page;
  const k = textScale(aspect);
  const veil = kit.colors.primary;
  const ink = inkOn(veil, kit);
  return (
    <>
      <Photo url={photoUrl} kit={kit} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          // Il velo copre tutta la parte con il testo: l'etichetta sta dove la foto è ancora chiara.
          background: `linear-gradient(to top, ${alpha(veil, 0.95)} 0%, ${alpha(veil, 0.86)} 38%, ${alpha(veil, 0.55)} 56%, ${alpha(veil, 0)} 80%)`,
        }}
      />
      <Frame aspect={aspect} background="transparent">
        <div style={{ flex: 1.05 }} />
        <Kicker text={text.kicker} color={accentOn(veil, kit)} kit={kit} scale={k} />
        <FitBlock max={104 * k} min={46 * k} align="end" box={{ flex: 1, marginTop: 18 * k }} style={{ ...headingFont(kit), ...HEADLINE, color: ink }}>
          {text.headline}
        </FitBlock>
        <Footer kit={kit} ink={ink} background={veil} pageIndex={pageIndex} pageCount={pageCount} scale={k} />
      </Frame>
    </>
  );
}

function PhotoFrame({ kit, page, aspect, pageIndex, pageCount, photoUrl }: CardProps) {
  const { text } = page;
  const k = textScale(aspect);
  const bg = kit.colors.primary;
  const ink = inkOn(bg, kit);
  const safe = SAFE_AREAS[aspect];
  const wide = aspect === '1.91:1' || aspect === '1:1';
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: wide ? 'row' : 'column', background: bg }}>
      <div style={{ position: 'relative', flex: wide ? '0 0 52%' : '0 0 58%' }}>
        <Photo url={photoUrl} kit={kit} />
      </div>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          padding: wide
            ? `${safe.top}px ${safe.right}px ${safe.bottom}px ${safe.left * 0.8}px`
            : `${64 * k}px ${safe.right}px ${safe.bottom}px ${safe.left}px`,
        }}>
        <Kicker text={text.kicker} color={accentOn(bg, kit)} kit={kit} scale={k} />
        <FitBlock max={84 * k} min={38 * k} box={{ flex: 1, marginTop: 16 * k }} style={{ ...headingFont(kit), ...HEADLINE, lineHeight: 1.06, color: ink }}>
          {text.headline}
        </FitBlock>
        {text.body ? (
          <FitBlock
            max={34 * k}
            min={22 * k}
            box={{ flex: 'none', height: 110 * k, marginTop: 14 * k }}
            style={{ ...bodyFont(kit), color: ink, opacity: 0.82, lineHeight: 1.35 }}>
            {text.body}
          </FitBlock>
        ) : null}
        <Footer kit={kit} ink={ink} background={bg} pageIndex={pageIndex} pageCount={pageCount} scale={k} />
      </div>
    </div>
  );
}

function PhotoOnly({ kit, aspect, pageIndex, pageCount, photoUrl }: CardProps) {
  const k = textScale(aspect);
  const shade = '#15171F';
  return (
    <>
      <Photo url={photoUrl} kit={kit} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '30%', background: `linear-gradient(to top, ${alpha(shade, 0.45)}, ${alpha(shade, 0)})` }} />
      <Frame aspect={aspect} background="transparent">
        <div style={{ flex: 1 }} />
        <Footer kit={kit} ink="#FFFFFF" background={shade} pageIndex={pageIndex} pageCount={pageCount} scale={k} />
      </Frame>
    </>
  );
}

function CutoutStatement({ kit, page, aspect, pageIndex, pageCount, cutoutUrl }: CardProps) {
  const { text } = page;
  const k = textScale(aspect);
  const bg = kit.colors.primary;
  const ink = inkOn(bg, kit);
  const wide = aspect === '1.91:1';
  const tall = aspect === '9:16';
  return (
    <Frame aspect={aspect} background={bg}>
      <Shape
        kind={kit.decoration === 'geometric' ? 'half' : 'circle'}
        size={wide ? 500 : tall ? 1000 : 820}
        color={shapeColor(kit, bg, ['accent', 'secondary', 'ground'])}
        style={{ position: 'absolute', right: wide ? 30 : -140, bottom: wide ? -120 : tall ? -200 : -260 }}
      />
      <Cutout
        url={cutoutUrl}
        kit={kit}
        style={{ right: wide ? 60 : 0, width: wide ? '40%' : '78%', height: wide ? '92%' : tall ? '50%' : '60%' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, position: 'relative', flex: 'none' }}>
        <Kicker text={text.kicker} color={accentOn(bg, kit)} kit={kit} scale={k} />
        <Logo kit={kit} background={bg} height={60 * k} />
      </div>
      <FitBlock
        max={110 * k}
        min={46 * k}
        box={{ flex: '0 1 auto', maxHeight: wide ? '78%' : '40%', width: wide ? '56%' : '100%', marginTop: 24 * k, position: 'relative' }}
        style={{ ...headingFont(kit), ...HEADLINE, color: ink }}>
        {text.headline}
      </FitBlock>
      <div style={{ flex: 1 }} />
      <Footer kit={kit} ink={ink} background={bg} pageIndex={pageIndex} pageCount={pageCount} scale={k} logo={false} />
    </Frame>
  );
}

function CutoutStat({ kit, page, aspect, pageIndex, pageCount, cutoutUrl }: CardProps) {
  const { text } = page;
  const k = textScale(aspect);
  const bg = valueGround(kit);
  const ink = inkOn(bg, kit);
  return (
    <Frame aspect={aspect} background={bg}>
      <Shape
        kind="circle"
        size={680 * k}
        color={shapeColor(kit, bg, ['secondary', 'accent'])}
        style={{ position: 'absolute', right: -180, bottom: -120 }}
      />
      <Cutout url={cutoutUrl} kit={kit} style={{ right: 0, width: '52%', height: aspect === '1.91:1' ? '94%' : '74%' }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, position: 'relative', flex: 'none' }}>
        <Kicker text={text.kicker} color={ink} kit={kit} scale={k} style={{ opacity: 0.8 }} />
        <Logo kit={kit} background={bg} height={60 * k} />
      </div>
      <FitBlock
        max={300 * k}
        min={100 * k}
        align="end"
        box={{ flex: 'none', height: '30%', width: '58%', position: 'relative' }}
        style={{ ...headingFont(kit), color: accentOn(bg, kit), lineHeight: 0.92, letterSpacing: '-0.045em', whiteSpace: 'nowrap' }}>
        {text.value}
      </FitBlock>
      <FitBlock
        max={70 * k}
        min={34 * k}
        box={{ flex: '0 1 auto', maxHeight: '34%', width: '50%', marginTop: 28 * k, position: 'relative' }}
        style={{ ...headingFont(kit), ...HEADLINE, lineHeight: 1.08, color: ink }}>
        {text.headline}
      </FitBlock>
      <div style={{ flex: 1 }} />
      <Footer kit={kit} ink={ink} background={bg} pageIndex={pageIndex} pageCount={pageCount} scale={k} logo={false} />
    </Frame>
  );
}

function Split({ kit, page, aspect, pageIndex, pageCount, photoUrl }: CardProps) {
  const { text } = page;
  const k = textScale(aspect);
  const bg = kit.colors.ground;
  const ink = inkOn(bg, kit);
  const safe = SAFE_AREAS[aspect];
  const row = aspect === '1.91:1' || aspect === '1:1';
  const items = text.items.filter((item) => item.body || item.title).slice(0, 3);
  const marker = shapeColor(kit, bg, ['accent', 'primary']);
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: row ? 'row' : 'column', background: bg }}>
      <div style={{ position: 'relative', flex: row ? '0 0 46%' : '0 0 46%' }}>
        <Photo url={photoUrl} kit={kit} />
      </div>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          padding: row ? `${safe.top}px ${safe.right}px ${safe.bottom}px ${safe.left * 0.8}px` : `${60 * k}px ${safe.right}px ${safe.bottom}px ${safe.left}px`,
        }}>
        <Kicker text={text.kicker} color={ink} kit={kit} scale={k} style={{ opacity: 0.72 }} />
        <FitBlock
          max={72 * k}
          min={34 * k}
          box={{ flex: '0 1 auto', maxHeight: items.length > 0 ? '40%' : '70%', marginTop: 14 * k }}
          style={{ ...headingFont(kit), ...HEADLINE, lineHeight: 1.06, color: ink }}>
          {text.headline}
        </FitBlock>
        <FitBlock max={36 * k} min={22 * k} box={{ flex: 1, marginTop: 22 * k }} style={{ ...bodyFont(kit), color: ink, lineHeight: 1.32 }}>
          {items.length > 0
            ? items.map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: '0.6em', alignItems: 'flex-start', marginBottom: '0.6em' }}>
                  <span style={{ width: '0.4em', height: '0.4em', borderRadius: '50%', background: marker, flex: 'none', marginTop: '0.45em' }} />
                  <span style={{ flex: 1, minWidth: 0 }}>{item.body || item.title}</span>
                </div>
              ))
            : <span style={{ opacity: 0.82 }}>{text.body}</span>}
        </FitBlock>
        <Footer kit={kit} ink={ink} background={bg} pageIndex={pageIndex} pageCount={pageCount} scale={k} />
      </div>
    </div>
  );
}

function Point({ kit, page, aspect, pageIndex, pageCount }: CardProps) {
  const { text } = page;
  const k = textScale(aspect);
  const bg = kit.colors.ground;
  const ink = inkOn(bg, kit);
  return (
    <Frame aspect={aspect} background={bg}>
      {kit.decoration === 'geometric' && (
        <Shape
          kind={pageIndex % 2 ? 'leaf' : 'quarter'}
          rotate={-90}
          size={200 * k}
          color={shapeColor(kit, bg, ['secondary', 'accent', 'primary'])}
          style={{ position: 'absolute', top: 0, right: 0 }}
        />
      )}
      <div style={{ ...headingFont(kit), flex: 'none', fontSize: 180 * k, lineHeight: 0.9, color: accentOn(bg, kit), letterSpacing: '-0.04em' }}>
        {String(pageIndex).padStart(2, '0')}
      </div>
      <div style={{ flex: 1 }} />
      <FitBlock
        max={86 * k}
        min={40 * k}
        box={{ flex: '0 1 auto', maxHeight: '44%' }}
        style={{ ...headingFont(kit), ...HEADLINE, lineHeight: 1.06, color: ink }}>
        {text.headline}
      </FitBlock>
      {text.body ? (
        <FitBlock
          max={44 * k}
          min={26 * k}
          box={{ flex: '0 1 auto', maxHeight: '26%', marginTop: 28 * k }}
          style={{ ...bodyFont(kit), color: ink, opacity: 0.84, lineHeight: 1.38 }}>
          {text.body}
        </FitBlock>
      ) : null}
      <Footer kit={kit} ink={ink} background={bg} pageIndex={pageIndex} pageCount={pageCount} scale={k} />
    </Frame>
  );
}

function Closing({ kit, page, aspect, pageIndex, pageCount }: CardProps) {
  const { text } = page;
  const k = textScale(aspect);
  const bg = kit.colors.primary;
  const ink = inkOn(bg, kit);
  return (
    <Frame aspect={aspect} background={bg}>
      <Accents kit={kit} background={bg} scale={k} compact />
      <FitBlock max={100 * k} min={44 * k} align="end" box={{ flex: 1, marginTop: 24 * k }} style={{ ...headingFont(kit), ...HEADLINE, color: ink }}>
        {text.headline}
      </FitBlock>
      {text.body ? (
        <FitBlock
          max={40 * k}
          min={24 * k}
          box={{ flex: 'none', height: 150 * k, marginTop: 24 * k }}
          style={{ ...bodyFont(kit), color: ink, opacity: 0.84, lineHeight: 1.35 }}>
          {text.body}
        </FitBlock>
      ) : null}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 * k, marginTop: 40 * k, flex: 'none' }}>
        {kit.logoUrl ? (
          <Logo kit={{ ...kit, signature: true }} background={bg} height={84 * k} />
        ) : (
          <span style={{ ...headingFont(kit), fontSize: 48 * k, color: ink }}>{kit.name}</span>
        )}
      </div>
      <Footer kit={kit} ink={ink} background={bg} pageIndex={pageIndex} pageCount={pageCount} scale={k} logo={false} />
    </Frame>
  );
}

export const LAYOUTS: Record<TemplateId, (props: CardProps) => ReactElement> = {
  statement: Statement,
  stat: Stat,
  list: List,
  steps: Steps,
  quote: Quote,
  'photo-cover': PhotoCover,
  'photo-frame': PhotoFrame,
  'photo-only': PhotoOnly,
  'cutout-statement': CutoutStatement,
  'cutout-stat': CutoutStat,
  split: Split,
  point: Point,
  closing: Closing,
};
