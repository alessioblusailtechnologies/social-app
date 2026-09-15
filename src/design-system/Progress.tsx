import { StyleSheet, View } from 'react-native';

import { colors, palette, radii } from './tokens';

/** Barra di avanzamento a segmenti: fatti in navy, corrente in coral, futuri in grigio. */
export function ProgressSegments({ count, current }: { count: number; current: number }) {
  return (
    <View
      style={styles.segments}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: count, now: current + 1 }}>
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={[
            styles.segment,
            {
              backgroundColor: i < current ? palette.navy700 : i === current ? palette.orange500 : palette.grey300,
            },
          ]}
        />
      ))}
    </View>
  );
}

/** Peso di un tema su 100. */
export function WeightBar({ weight, color }: { weight: number; color: string }) {
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${Math.max(0, Math.min(100, weight))}%`, backgroundColor: color }]} />
    </View>
  );
}

/** Più valori affiancati in proporzione, es. i pesi di tutti i temi. */
export function StackedBar({ segments, height = 10 }: { segments: { value: number; color: string }[]; height?: number }) {
  return (
    <View style={[styles.stacked, { height }]}>
      {segments
        .filter((segment) => segment.value > 0)
        // Destrutturato: il plugin dei worklet scambia `x.value` in uno style inline per uno shared value e avvisa.
        .map(({ value, color }, i) => (
          <View key={i} style={{ flex: value, backgroundColor: color }} />
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  segments: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 4, borderRadius: radii.pill },
  track: {
    flex: 1,
    height: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceSunken,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radii.pill },
  stacked: {
    flexDirection: 'row',
    gap: 2,
    borderRadius: radii.pill,
    overflow: 'hidden',
    backgroundColor: colors.surfaceSunken,
  },
});
