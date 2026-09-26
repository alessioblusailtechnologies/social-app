import { StyleSheet, View } from 'react-native';

import {
  Card,
  Dot,
  PatternGrid,
  PressableScale,
  RadioMark,
  ShapeTile,
  Text,
  colors,
  palette,
  radii,
  screenStyles,
  type ShapeKind,
} from '@/design-system';
import type { BrandKind } from '@shared/domain/brand';
import { KIND_OPTIONS } from '@shared/domain/catalog';

const INTRO_LIST = [
  'Per chi scrivo e cosa fai',
  'I canali su cui pubblicare',
  'I temi, ognuno con il suo peso',
  'Come scrivi e come vuoi apparire',
];
const INTRO_COLORS = [palette.orange500, palette.navy700, palette.lime400, palette.mint400];

const OPTION_SHAPES: { kind: ShapeKind; color: string }[] = [
  { kind: 'circle', color: palette.orange500 },
  { kind: 'quarter', color: palette.navy700 },
  { kind: 'leaf', color: palette.mint400 },
];

export function IntroStep({ kind, onChoose }: { kind: BrandKind | null; onChoose: (kind: BrandKind) => void }) {
  return (
    <View style={styles.column}>
      <Card media={<PatternGrid columns={6} rows={3} seed={19} />} mediaHeight={160}>
        <View style={styles.cardContent}>
          <Text variant="heading">Cinque minuti, una volta sola</Text>
          <Text variant="body">
            Ti chiedo chi sei, cosa vuoi ottenere, i canali, i temi, come scrivi e come vuoi apparire. Da lì genero
            proposte che sembrano scritte da te. Ogni cosa si cambia anche dopo, dal Profilo.
          </Text>
          <View style={styles.list}>
            {INTRO_LIST.map((label, i) => (
              <View key={label} style={styles.listRow}>
                <Dot color={INTRO_COLORS[i]} square={i % 2 === 0} />
                <Text variant="body" color={colors.textTitle} style={styles.listText}>
                  {label}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </Card>

      <Text variant="label" style={[screenStyles.groupLabel, styles.groupLabel]}>
        Per chi costruiamo la presenza
      </Text>
      <View style={styles.options} accessibilityRole="radiogroup">
        {KIND_OPTIONS.map((option, i) => {
          const selected = option.kind === kind;
          return (
            <PressableScale
              key={option.kind}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`${option.title}. ${option.meta}`}
              onPress={() => onChoose(option.kind)}
              style={[styles.option, selected && styles.optionSelected]}>
              <ShapeTile
                kind={OPTION_SHAPES[i].kind}
                color={OPTION_SHAPES[i].color}
                ground={palette.grey100}
                size={36}
                radius={10}
              />
              <View style={styles.optionText}>
                <Text variant="strong">{option.title}</Text>
                <Text variant="caption">{option.meta}</Text>
              </View>
              <RadioMark selected={selected} />
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: 14 },
  cardContent: { gap: 10 },
  list: { gap: 7, paddingTop: 4 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  listText: { lineHeight: 18 },
  groupLabel: { paddingTop: 4, marginBottom: -4 },
  options: { gap: 10 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: radii.xl,
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: colors.surfaceCard,
  },
  optionSelected: { borderColor: colors.borderStrong },
  optionText: { flex: 1, minWidth: 0, gap: 3 },
});
