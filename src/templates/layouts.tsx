import type { CSSProperties, ReactElement, ReactNode } from 'react';

import type { CardItem, KitFace, TemplateId } from '@/domain/visual';

import {
  Band,
  Cutout,
  FitBlock,
  Footer,
  Frame,
  Header,
  Label,
  Photo,
  alpha,
  faceStyle,
  gridFor,
  pageLabel,
  voiceSize,
  voiceStyle,
  type Grid,
} from './parts';
import type { CardProps } from './types';

/**
 * Le tavole. Sono tutte la stessa tavola, come nel generatore di assieme: cambia solo il blocco centrale (una frase,
 * un numero, una lista, una foto nel riquadro, la fascia). Fondo, caratteri, firma e rubrica sono quelli della linea
 * del brand, per ogni card: il feed si riconosce a colpo d'occhio.
 */

type Kit = CardProps['kit'];

type Align = 'center' | 'start' | 'end';

/** Dove la linea vuole il testo delle card senza foto: al centro, in alto o in basso. */
const anchorOf = (kit: Kit): Align => (kit.line.anchor === 'top' ? 'start' : kit.line.anchor === 'bottom' ? 'end' : 'center');

/** Il blocco centrale: tra la rubrica e il piede, centrato in altezza, appoggiato in alto o in basso. */
function Region({ grid, align = 'center', children, style }: { grid: Grid; align?: Align; children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: align === 'center' ? 'center' : align === 'end' ? 'flex-end' : 'flex-start',
        marginTop: 40 * grid.k,
        position: 'relative',
        ...style,
      }}>
      {children}
    </div>
  );
}

/** La frase grande, nel carattere della voce: il corpo viene dalla lunghezza e scende finché non entra. */
function Voice({
  text,
  kit,
  grid,
  cap,
  face,
  color,
  box,
}: {
  text: string;
  kit: Kit;
  grid: Grid;
  cap?: number;
  face?: KitFace;
  color?: string;
  box?: CSSProperties;
}) {
  if (!text) return null;
  const max = voiceSize(text, grid.k, cap);
  return (
    <FitBlock
      max={max}
      min={Math.round(max * 0.55)}
      box={{ flex: '0 1 auto', ...box }}
      style={{ ...voiceStyle(face ?? kit.line.voice), color: color ?? kit.line.tones.ink }}>
      {text}
    </FitBlock>
  );
}

/** La riga sotto la frase: il testo secondario, o in accento quando è un invito o un indirizzo. */
function Sub({ text, kit, grid, accent = false }: { text: string; kit: Kit; grid: Grid; accent?: boolean }) {
  if (!text) return null;
  const { tones, text: face } = kit.line;
  return (
    <FitBlock
      max={34 * grid.k}
      min={22 * grid.k}
      box={{ flex: '0 1 auto', maxHeight: '34%', marginTop: 34 * grid.k }}
      style={{ ...faceStyle(face), lineHeight: 1.4, color: accent ? tones.accent : tones.soft }}>
      {text}
    </FitBlock>
  );
}

/** Le righe numerate di una lista o dei passi, separate dal filetto. */
function Rows({ items, kit, grid, titled }: { items: CardItem[]; kit: Kit; grid: Grid; titled: boolean }) {
  const { tones, label, title, text } = kit.line;
  return (
    <>
      {items.map((item, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: '0.9em',
            borderTop: `${Math.max(1, 2 * grid.k)}px solid ${tones.rule}`,
            padding: '0.6em 0',
          }}>
          <span style={{ ...faceStyle(label), flex: 'none', width: '2em', fontSize: '0.62em', letterSpacing: '0.1em', color: tones.accent }}>
            {String(i + 1).padStart(2, '0')}
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            {titled && item.title ? (
              <>
                <span style={{ ...faceStyle(title), display: 'block', color: tones.ink, lineHeight: 1.15 }}>{item.title}</span>
                {item.body ? (
                  <span style={{ ...faceStyle(text), display: 'block', color: tones.soft, fontSize: '0.8em', marginTop: '0.25em' }}>
                    {item.body}
                  </span>
                ) : null}
              </>
            ) : (
              <span style={{ ...faceStyle(text), color: tones.ink }}>
                {item.title && item.body ? `${item.title}: ${item.body.charAt(0).toLowerCase()}${item.body.slice(1)}` : item.title || item.body}
              </span>
            )}
          </span>
        </div>
      ))}
    </>
  );
}

function usableItems(items: CardItem[], max: number): CardItem[] {
  return items.filter((item) => item.title || item.body).slice(0, max);
}

/** Dove si chiude il piede, dal basso: il soggetto scontornato ci si appoggia sopra. */
const footerLift = (grid: Grid) => grid.bottom + 64 * grid.k;

// ---------------------------------------------------------------------------

/** La frase della voce, con la riga sotto. La copertina di un carosello porta la fascia del brand, se la linea ce l'ha. */
function Statement(props: CardProps) {
  const { kit, page, aspect, pageIndex, pageCount } = props;
  if (pageCount > 1 && pageIndex === 0 && kit.line.bandUrl) return <Opening {...props} photoUrl={kit.line.bandUrl} />;
  const grid = gridFor(aspect);
  const { text } = page;
  return (
    <Frame grid={grid} kit={kit}>
      <Header kit={kit} grid={grid} kicker={text.kicker} />
      <Region grid={grid} align={anchorOf(kit)}>
        <Voice text={text.headline} kit={kit} grid={grid} />
        <Sub text={text.body} kit={kit} grid={grid} />
      </Region>
      <Footer kit={kit} grid={grid} pageIndex={pageIndex} pageCount={pageCount} />
    </Frame>
  );
}

/** L'apertura, nella composizione della linea: fascia che sfuma, blocco in alto col testo sotto, foto a tutta card. */
function Opening(props: CardProps) {
  if (props.kit.line.photo === 'block') return <OpeningBlock {...props} />;
  if (props.kit.line.photo === 'full') return <OpeningFull {...props} />;
  return <OpeningBand {...props} />;
}

/** La frase in alto e la fascia con la foto che nasce dal fondo. Niente piede: la pagina sta in alto. */
function OpeningBand({ kit, page, aspect, pageIndex, pageCount, photoUrl }: CardProps) {
  const grid = gridFor(aspect);
  const { text } = page;
  const band = grid.wide ? '42%' : aspect === '1:1' ? '30%' : aspect === '9:16' ? '34%' : '36%';
  return (
    <>
      <Band url={photoUrl} kit={kit} size={band} side={grid.wide} />
      <Frame
        grid={grid}
        kit={kit}
        style={grid.wide ? { paddingRight: `calc(${band} + ${grid.side * 0.5}px)` } : { paddingBottom: `calc(${band} + ${40 * grid.k}px)` }}>
        <Header kit={kit} grid={grid} kicker={text.kicker} page={pageLabel(pageIndex, pageCount)} />
        <Region grid={grid}>
          <Voice text={text.headline} kit={kit} grid={grid} />
          <Sub text={text.body} kit={kit} grid={grid} />
        </Region>
      </Frame>
    </>
  );
}

/** La foto in un blocco in alto, a filo o dentro i margini, e sotto la frase grande: la card di una testata. */
function OpeningBlock({ kit, page, aspect, pageIndex, pageCount, photoUrl }: CardProps) {
  const grid = gridFor(aspect);
  const { text } = page;
  const pad = kit.line.inset ? grid.side : 0;
  const share = grid.wide ? '50%' : aspect === '9:16' ? '46%' : aspect === '1:1' ? '50%' : '54%';
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: grid.wide ? 'row' : 'column' }}>
      <div
        style={{
          flex: `0 0 ${share}`,
          boxSizing: 'border-box',
          order: grid.wide ? 2 : 0,
          padding: grid.wide ? `${pad}px ${pad}px ${pad}px 0` : `${pad}px ${pad}px 0`,
        }}>
        <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
          <Photo url={photoUrl} kit={kit} />
        </div>
      </div>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          padding: grid.wide
            ? `${grid.top}px ${grid.side * 0.7}px ${grid.bottom}px ${grid.side}px`
            : `${56 * grid.k}px ${grid.side}px ${grid.bottom}px`,
        }}>
        <Header kit={kit} grid={grid} kicker={text.kicker} />
        <Region grid={grid} align={grid.wide ? 'center' : 'start'} style={{ marginTop: kit.line.kicker && text.kicker ? 22 * grid.k : 0 }}>
          <Voice text={text.headline} kit={kit} grid={grid} cap={96} />
          <Sub text={text.body} kit={kit} grid={grid} />
        </Region>
        <Footer kit={kit} grid={grid} pageIndex={pageIndex} pageCount={pageCount} />
      </div>
    </div>
  );
}

/** La foto a tutta card, il fondo che sale dal basso e la frase appoggiata sopra. */
function OpeningFull({ kit, page, aspect, pageIndex, pageCount, photoUrl }: CardProps) {
  const grid = gridFor(aspect);
  const { text } = page;
  const { ground } = kit.line.tones;
  return (
    <>
      <Photo url={photoUrl} kit={kit} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(to top, ${alpha(ground, 0.96)} 0%, ${alpha(ground, 0.86)} 34%, ${alpha(ground, 0.25)} 66%, ${alpha(ground, 0)} 100%)`,
        }}
      />
      <Frame grid={grid} kit={kit}>
        <Region grid={grid} align="end">
          {kit.line.kicker ? <Label text={text.kicker} kit={kit} size={23 * grid.k} style={{ marginBottom: 28 * grid.k }} /> : null}
          <Voice text={text.headline} kit={kit} grid={grid} cap={96} />
          <Sub text={text.body} kit={kit} grid={grid} />
        </Region>
        <Footer kit={kit} grid={grid} pageIndex={pageIndex} pageCount={pageCount} />
      </Frame>
    </>
  );
}

function Stat({ kit, page, aspect, pageIndex, pageCount }: CardProps) {
  const grid = gridFor(aspect);
  const { text } = page;
  return (
    <Frame grid={grid} kit={kit}>
      <Header kit={kit} grid={grid} kicker={text.kicker} />
      <Region grid={grid} align={anchorOf(kit)}>
        <FitBlock
          max={290 * grid.k}
          min={110 * grid.k}
          align="end"
          box={{ flex: 'none', height: (grid.wide ? 190 : 290) * grid.k }}
          style={{ ...faceStyle(kit.line.title), color: kit.line.tones.accent, lineHeight: 0.95, letterSpacing: '-0.03em', whiteSpace: 'nowrap' }}>
          {text.value}
        </FitBlock>
        <Voice text={text.headline} kit={kit} grid={grid} cap={72} box={{ marginTop: 30 * grid.k }} />
        <Sub text={text.body} kit={kit} grid={grid} />
      </Region>
      <Footer kit={kit} grid={grid} pageIndex={pageIndex} pageCount={pageCount} />
    </Frame>
  );
}

function ListLike({ kit, page, aspect, pageIndex, pageCount, titled }: CardProps & { titled: boolean }) {
  const grid = gridFor(aspect);
  const { text } = page;
  const items = usableItems(text.items, titled ? 4 : 5);
  return (
    <Frame grid={grid} kit={kit}>
      <Header kit={kit} grid={grid} kicker={text.kicker} />
      <Region grid={grid} style={grid.wide ? { flexDirection: 'row', alignItems: 'center', gap: 48 * grid.k } : undefined}>
        <Voice
          text={text.headline}
          kit={kit}
          grid={grid}
          cap={titled ? 66 : 74}
          box={grid.wide ? { flex: '0 0 42%', maxHeight: '100%' } : { maxHeight: '36%' }}
        />
        <FitBlock
          max={(titled ? 38 : 36) * grid.k}
          min={20 * grid.k}
          align={grid.wide ? 'center' : 'start'}
          box={grid.wide ? { flex: 1, height: '100%' } : { flex: '0 1 auto', marginTop: 48 * grid.k }}
          style={{ lineHeight: 1.3 }}>
          <Rows items={items} kit={kit} grid={grid} titled={titled} />
        </FitBlock>
      </Region>
      <Footer kit={kit} grid={grid} pageIndex={pageIndex} pageCount={pageCount} />
    </Frame>
  );
}

const List = (props: CardProps) => <ListLike {...props} titled={false} />;
const Steps = (props: CardProps) => <ListLike {...props} titled />;

function Quote({ kit, page, aspect, pageIndex, pageCount }: CardProps) {
  const grid = gridFor(aspect);
  const { text } = page;
  const words = text.body.replace(/^[\s«"“”']+|[\s»"“”']+$/g, '');
  return (
    <Frame grid={grid} kit={kit}>
      <Header kit={kit} grid={grid} kicker={text.kicker} />
      <Region grid={grid} align={anchorOf(kit)}>
        <Voice text={words ? `«${words}»` : ''} kit={kit} grid={grid} />
        <Label text={text.author} kit={kit} size={24 * grid.k} style={{ marginTop: 40 * grid.k }} />
      </Region>
      <Footer kit={kit} grid={grid} pageIndex={pageIndex} pageCount={pageCount} />
    </Frame>
  );
}

/** La frase in alto e la foto grande nel riquadro bordato dal filetto, come gli screen dell'app nelle card di Velia. */
function PhotoFrame({ kit, page, aspect, pageIndex, pageCount, photoUrl }: CardProps) {
  const grid = gridFor(aspect);
  const { text } = page;
  return (
    <Frame grid={grid} kit={kit}>
      <Header kit={kit} grid={grid} kicker={text.kicker} />
      <Region grid={grid} align="start" style={grid.wide ? { flexDirection: 'row', gap: 48 * grid.k } : undefined}>
        <Voice
          text={text.headline}
          kit={kit}
          grid={grid}
          cap={70}
          box={grid.wide ? { flex: '0 0 42%', maxHeight: '100%', justifyContent: 'center' } : { maxHeight: '34%' }}
        />
        <div
          style={{
            position: 'relative',
            flex: 1,
            minHeight: 0,
            marginTop: grid.wide || !text.headline ? 0 : 48 * grid.k,
            border: kit.line.footer === 'rule' ? `${Math.max(1, 2 * grid.k)}px solid ${kit.line.tones.rule}` : 'none',
            overflow: 'hidden',
          }}>
          <Photo url={photoUrl} kit={kit} />
        </div>
      </Region>
      <Footer kit={kit} grid={grid} pageIndex={pageIndex} pageCount={pageCount} />
    </Frame>
  );
}

/**
 * Solo la foto, pulita: al massimo il marchio in un angolo. Solo la linea col filetto e la firma fa salire il fondo
 * dal basso, quanto basta per leggerle.
 */
function PhotoOnly({ kit, aspect, pageIndex, pageCount, photoUrl }: CardProps) {
  const grid = gridFor(aspect);
  const { ground } = kit.line.tones;
  if (kit.line.footer !== 'rule') {
    return (
      <>
        <Photo url={photoUrl} kit={kit} />
        <Frame grid={grid} kit={kit} style={{ justifyContent: 'flex-end' }}>
          <Footer kit={kit} grid={grid} pageIndex={pageIndex} pageCount={pageCount} rule={false} />
        </Frame>
      </>
    );
  }
  return (
    <>
      <Photo url={photoUrl} kit={kit} />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: grid.bottom + 220 * grid.k,
          background: `linear-gradient(to top, ${ground} 0%, ${alpha(ground, 0.9)} ${Math.round(((grid.bottom + 60 * grid.k) / (grid.bottom + 220 * grid.k)) * 100)}%, ${alpha(ground, 0)} 100%)`,
        }}
      />
      <Frame grid={grid} kit={kit} style={{ justifyContent: 'flex-end' }}>
        <Footer kit={kit} grid={grid} pageIndex={pageIndex} pageCount={pageCount} rule={false} />
      </Frame>
    </>
  );
}

function CutoutStatement({ kit, page, aspect, pageIndex, pageCount, cutoutUrl }: CardProps) {
  const grid = gridFor(aspect);
  const { text } = page;
  return (
    <>
      <Cutout
        url={cutoutUrl}
        kit={kit}
        style={{ right: grid.side * 0.5, bottom: footerLift(grid), width: grid.wide ? '40%' : '72%', height: grid.wide ? '70%' : '50%' }}
      />
      <Frame grid={grid} kit={kit}>
        <Header kit={kit} grid={grid} kicker={text.kicker} />
        <Region grid={grid} align="start">
          <Voice text={text.headline} kit={kit} grid={grid} cap={84} box={{ maxHeight: grid.wide ? '100%' : '46%', width: grid.wide ? '54%' : '100%' }} />
        </Region>
        <Footer kit={kit} grid={grid} pageIndex={pageIndex} pageCount={pageCount} />
      </Frame>
    </>
  );
}

function CutoutStat({ kit, page, aspect, pageIndex, pageCount, cutoutUrl }: CardProps) {
  const grid = gridFor(aspect);
  const { text } = page;
  return (
    <>
      <Cutout
        url={cutoutUrl}
        kit={kit}
        style={{ right: grid.side * 0.4, bottom: footerLift(grid), width: '48%', height: grid.wide ? '74%' : '62%' }}
      />
      <Frame grid={grid} kit={kit}>
        <Header kit={kit} grid={grid} kicker={text.kicker} />
        <Region grid={grid} style={{ width: '52%' }}>
          <FitBlock
            max={240 * grid.k}
            min={90 * grid.k}
            align="end"
            box={{ flex: 'none', height: (grid.wide ? 160 : 250) * grid.k }}
            style={{ ...faceStyle(kit.line.title), color: kit.line.tones.accent, lineHeight: 0.95, letterSpacing: '-0.03em', whiteSpace: 'nowrap' }}>
            {text.value}
          </FitBlock>
          <Voice text={text.headline} kit={kit} grid={grid} cap={62} box={{ marginTop: 26 * grid.k }} />
        </Region>
        <Footer kit={kit} grid={grid} pageIndex={pageIndex} pageCount={pageCount} />
      </Frame>
    </>
  );
}

/** La foto a tutta larghezza in alto, sotto la tavola con la frase. */
function Split({ kit, page, aspect, pageIndex, pageCount, photoUrl }: CardProps) {
  const grid = gridFor(aspect);
  const { text } = page;
  const items = usableItems(text.items, 3);
  const k = grid.k;
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: grid.wide ? 'row' : 'column' }}>
      <div
        style={{
          flex: '0 0 44%',
          boxSizing: 'border-box',
          order: grid.wide ? 2 : 0,
          padding: kit.line.inset ? (grid.wide ? `${grid.side}px ${grid.side}px ${grid.side}px 0` : `${grid.side}px ${grid.side}px 0`) : 0,
        }}>
        <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
          <Photo url={photoUrl} kit={kit} />
        </div>
      </div>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          padding: grid.wide
            ? `${grid.top}px ${grid.side * 0.8}px ${grid.bottom}px ${grid.side}px`
            : `${56 * k}px ${grid.side}px ${grid.bottom}px`,
        }}>
        <Header kit={kit} grid={grid} kicker={text.kicker} />
        <Region grid={grid} style={{ marginTop: 26 * k }}>
          <Voice text={text.headline} kit={kit} grid={grid} cap={70} box={{ maxHeight: items.length > 0 ? '48%' : '70%' }} />
          {items.length > 0 ? (
            <FitBlock max={32 * k} min={20 * k} box={{ flex: '0 1 auto', marginTop: 30 * k }} style={{ lineHeight: 1.3 }}>
              <Rows items={items} kit={kit} grid={grid} titled={false} />
            </FitBlock>
          ) : (
            <Sub text={text.body} kit={kit} grid={grid} />
          )}
        </Region>
        <Footer kit={kit} grid={grid} pageIndex={pageIndex} pageCount={pageCount} />
      </div>
    </div>
  );
}

/** La slide centrale del carosello: il numero del punto sopra la frase, la pagina nel piede. */
function Point({ kit, page, aspect, pageIndex, pageCount }: CardProps) {
  const grid = gridFor(aspect);
  const { text } = page;
  return (
    <Frame grid={grid} kit={kit}>
      <Header kit={kit} grid={grid} kicker={text.kicker} />
      <Region grid={grid} align={anchorOf(kit)}>
        <Label text={String(pageIndex).padStart(2, '0')} kit={kit} size={27 * grid.k} style={{ marginBottom: 34 * grid.k }} />
        <Voice text={text.headline} kit={kit} grid={grid} cap={80} />
        <Sub text={text.body} kit={kit} grid={grid} />
      </Region>
      <Footer kit={kit} grid={grid} pageIndex={pageIndex} pageCount={pageCount} />
    </Frame>
  );
}

/** La chiusura: la frase che resta e, in accento, dove andare. Senza riga, l'indirizzo del brand. */
function Closing({ kit, page, aspect, pageIndex, pageCount }: CardProps) {
  const grid = gridFor(aspect);
  const { text } = page;
  return (
    <Frame grid={grid} kit={kit}>
      <Header kit={kit} grid={grid} kicker={text.kicker} />
      <Region grid={grid} align={anchorOf(kit)}>
        <Voice text={text.headline} kit={kit} grid={grid} />
        <Sub text={text.body || kit.line.address} kit={kit} grid={grid} accent />
      </Region>
      <Footer kit={kit} grid={grid} pageIndex={pageIndex} pageCount={pageCount} />
    </Frame>
  );
}

export const LAYOUTS: Record<TemplateId, (props: CardProps) => ReactElement> = {
  statement: Statement,
  stat: Stat,
  list: List,
  steps: Steps,
  quote: Quote,
  'photo-cover': Opening,
  'photo-frame': PhotoFrame,
  'photo-only': PhotoOnly,
  'cutout-statement': CutoutStatement,
  'cutout-stat': CutoutStat,
  split: Split,
  point: Point,
  closing: Closing,
};
