import { Check } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { colors, palette, radii } from '@shared/design-system/tokens';

export type StatusTone = 'complete' | 'partial' | 'missing';

const STATUS_COLORS: Record<StatusTone, string> = {
  complete: colors.statusComplete,
  partial: colors.statusPartial,
  missing: colors.statusMissing,
};

/** Verde completo, giallo parziale o saltato, grigio mancante. */
export function StatusDot({ tone, size = 16 }: { tone: StatusTone; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: radii.pill, backgroundColor: STATUS_COLORS[tone] }} />;
}

export function RadioMark({ selected }: { selected: boolean }) {
  return <View style={[styles.radio, selected ? styles.radioOn : styles.radioOff]} />;
}

export function CheckboxMark({ checked }: { checked: boolean }) {
  return (
    <View style={[styles.checkbox, checked ? styles.checkboxOn : styles.checkboxOff]}>
      {checked && <Check size={14} color={palette.white} strokeWidth={3} />}
    </View>
  );
}

/** Pallino (o quadratino) di colore: temi, elenchi, legende. */
export function Dot({ color, size = 10, square = false }: { color: string; size?: number; square?: boolean }) {
  return (
    <View style={{ width: size, height: size, borderRadius: square ? 2 : radii.pill, backgroundColor: color }} />
  );
}

const styles = StyleSheet.create({
  radio: { width: 16, height: 16, borderRadius: radii.pill },
  radioOn: { backgroundColor: colors.actionPrimary },
  radioOff: { borderWidth: 1.5, borderColor: colors.borderField },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radii.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.actionPrimary, borderColor: colors.actionPrimary },
  checkboxOff: { borderColor: colors.borderField },
});
