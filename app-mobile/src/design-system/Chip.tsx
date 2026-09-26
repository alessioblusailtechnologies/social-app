import { X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { PressableScale } from './PressableScale';
import { Text } from './Text';
import { colors, palette, radii } from '@shared/design-system/tokens';

export interface ChipProps {
  label: string;
  selected?: boolean;
  /** Chip selezionabile (multi-scelta). */
  onPress?: () => void;
  /** Chip rimovibile: bordo leggero e croce. */
  onRemove?: () => void;
  size?: 'sm' | 'md';
  /** Elemento prima dell'etichetta, es. il pallino di un tema. */
  leading?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Senza `onPress` né `onRemove` è un'etichetta statica. */
export function Chip({ label, selected = false, onPress, onRemove, size = 'md', leading, style }: ChipProps) {
  const containerStyle = [
    styles.base,
    size === 'sm' ? styles.small : styles.medium,
    selected ? styles.selected : onRemove ? styles.outline : styles.idle,
    style,
  ];
  const content = (
    <>
      {leading}
      <Text
        variant="action"
        color={selected ? palette.white : colors.textTitle}
        style={size === 'sm' && styles.smallText}>
        {label}
      </Text>
      {onRemove && <X size={12} color={colors.textTitle} strokeWidth={2.25} />}
    </>
  );

  if (onRemove) {
    return (
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`Rimuovi ${label}`}
        onPress={onRemove}
        style={containerStyle}>
        {content}
      </PressableScale>
    );
  }
  if (onPress) {
    return (
      <PressableScale
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={label}
        onPress={onPress}
        style={containerStyle}>
        {content}
      </PressableScale>
    );
  }
  return <View style={containerStyle}>{content}</View>;
}

export function ChipGroup({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.group, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radii.pill,
    borderWidth: 1.5,
  },
  medium: { minHeight: 38, paddingHorizontal: 14 },
  small: { minHeight: 30, paddingHorizontal: 11 },
  smallText: { fontSize: 11, lineHeight: 14 },
  selected: { backgroundColor: colors.actionPrimary, borderColor: colors.actionPrimary },
  idle: { backgroundColor: palette.white, borderColor: colors.borderField },
  outline: { backgroundColor: 'transparent', borderColor: colors.borderField },
  group: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
});
