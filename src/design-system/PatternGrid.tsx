import { useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { composePattern, type ShapeKind, type Tile, type TileRotation } from './pattern';
import { palette } from './tokens';

/** Ruota un punto del modulo attorno al suo centro, come `transform: rotate()` in CSS. */
function rotate(x: number, y: number, size: number, rotation: TileRotation): [number, number] {
  const c = size / 2;
  const dx = x - c;
  const dy = y - c;
  switch (rotation) {
    case 90:
      return [c - dy, c + dx];
    case 180:
      return [c - dx, c - dy];
    case 270:
      return [c + dy, c - dx];
    default:
      return [x, y];
  }
}

function TileShape({ tile, x, y, size }: { tile: Tile; x: number; y: number; size: number }) {
  const s = size;
  const point = (px: number, py: number) => {
    const [rx, ry] = rotate(px, py, s, tile.rotation);
    return `${x + rx} ${y + ry}`;
  };
  const cx = x + s / 2;
  const cy = y + s / 2;

  let shape = null;
  switch (tile.kind) {
    case 'solid':
      shape = <Rect x={x} y={y} width={s} height={s} fill={tile.color} />;
      break;
    case 'circle':
      shape = <Circle cx={cx} cy={cy} r={s / 2} fill={tile.color} />;
      break;
    case 'donut':
      shape = (
        <>
          <Circle cx={cx} cy={cy} r={s / 2} fill={tile.color} />
          <Circle cx={cx} cy={cy} r={s * 0.23} fill={tile.ground} />
        </>
      );
      break;
    case 'dot':
      shape = <Circle cx={cx} cy={cy} r={s * 0.18} fill={tile.color} />;
      break;
    case 'quarter':
      // border-radius: 100% 0 0 0 → quarto di cerchio centrato nell'angolo in basso a destra.
      shape = <Path d={`M ${point(0, s)} A ${s} ${s} 0 0 1 ${point(s, 0)} L ${point(s, s)} Z`} fill={tile.color} />;
      break;
    case 'leaf':
      // border-radius: 100% 0 100% 0 → due angoli opposti pieni.
      shape = (
        <Path
          d={`M ${point(0, s)} A ${s} ${s} 0 0 1 ${point(s, 0)} A ${s} ${s} 0 0 1 ${point(0, s)} Z`}
          fill={tile.color}
        />
      );
      break;
    case 'half':
      // Metà superiore con border-radius: 100% 100% 0 0, come la disegna il browser: una cupola ellittica.
      shape = (
        <Path
          d={`M ${point(0, s / 2)} L ${point(0, s / 4)} A ${s / 2} ${s / 4} ${tile.rotation} 0 1 ${point(s, s / 4)} L ${point(s, s / 2)} Z`}
          fill={tile.color}
        />
      );
      break;
  }

  return (
    <>
      {tile.ground !== palette.white && <Rect x={x} y={y} width={s} height={s} fill={tile.ground} />}
      {shape}
    </>
  );
}

export interface PatternGridProps {
  columns?: number;
  rows?: number;
  seed?: number;
  style?: StyleProp<ViewStyle>;
}

/** Il cuore dell'identità: griglia di moduli quadrati, ognuno con una forma elementare. */
export function PatternGrid({ columns = 4, rows = 4, seed = 7, style }: PatternGridProps) {
  const [width, setWidth] = useState(0);
  const tiles = composePattern(columns, rows, seed);
  const size = width / columns;

  return (
    <View
      style={style}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden>
      {width > 0 && (
        <Svg width={width} height={size * rows}>
          <Rect x={0} y={0} width={width} height={size * rows} fill={palette.white} />
          {tiles.map((tile, i) => (
            <TileShape key={i} tile={tile} x={(i % columns) * size} y={Math.floor(i / columns) * size} size={size} />
          ))}
        </Svg>
      )}
    </View>
  );
}

export interface ShapeTileProps {
  kind: ShapeKind;
  color: string;
  ground?: string;
  rotation?: TileRotation;
  size: number;
  radius?: number;
}

/** Un singolo modulo: decorazione o segnaposto. Mai un simbolo che porta significato. */
export function ShapeTile({ kind, color, ground = palette.white, rotation = 0, size, radius = 0 }: ShapeTileProps) {
  return (
    <View
      style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden', backgroundColor: ground }}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden>
      <Svg width={size} height={size}>
        <TileShape tile={{ kind, color, ground, rotation }} x={0} y={0} size={size} />
      </Svg>
    </View>
  );
}
