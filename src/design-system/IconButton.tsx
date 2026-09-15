import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { PressableScale } from './PressableScale';
import { colors, layout, palette, radii } from './tokens';

export type IconButtonVariant = 'surface' | 'outline' | 'ghost' | 'solid';

export interface IconButtonProps {
  icon: LucideIcon;
  accessibilityLabel: string;
  onPress?: () => void;
  variant?: IconButtonVariant;
  /** Altezza; la larghezza è uguale salvo `width`. */
  size?: number;
  width?: number;
  iconSize?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function IconButton({
  icon: Icon,
  accessibilityLabel,
  onPress,
  variant = 'surface',
  size = 36,
  width,
  iconSize = 18,
  disabled = false,
  style,
}: IconButtonProps) {
  const iconColor = disabled ? colors.textDisabled : variant === 'solid' ? palette.white : colors.textTitle;
  const slop = Math.max(0, (layout.hitMin - size) / 2);

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={slop}
      style={[styles.base, { width: width ?? size, height: size }, styles[variant], style]}>
      <Icon size={iconSize} color={iconColor} strokeWidth={2} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
  },
  surface: { backgroundColor: palette.white },
  outline: { borderWidth: 1.5, borderColor: colors.borderField },
  ghost: {},
  solid: { backgroundColor: colors.actionPrimary },
});
