import { useState, type ReactNode } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { PressableScale } from './PressableScale';
import { Text } from './Text';
import { colors, palette, radii } from '@shared/design-system/tokens';

export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'inverse';
export type ButtonSize = 'sm' | 'md' | 'lg';

const SIZES: Record<ButtonSize, { height: number; paddingHorizontal: number; fontSize: number }> = {
  sm: { height: 36, paddingHorizontal: 18, fontSize: 12 },
  md: { height: 44, paddingHorizontal: 24, fontSize: 13 },
  lg: { height: 52, paddingHorizontal: 32, fontSize: 14 },
};

const VARIANTS: Record<ButtonVariant, { background: string; border: string; text: string; pressed: string }> = {
  primary: {
    background: colors.actionPrimary,
    border: colors.actionPrimary,
    text: palette.white,
    pressed: colors.actionPrimaryPress,
  },
  accent: {
    background: colors.actionAccent,
    border: colors.actionAccent,
    text: palette.white,
    pressed: colors.actionAccentPress,
  },
  secondary: {
    background: 'transparent',
    border: colors.borderStrong,
    text: colors.textTitle,
    pressed: colors.surfaceSunken,
  },
  ghost: {
    background: 'transparent',
    border: 'transparent',
    text: colors.textTitle,
    pressed: colors.surfaceSunken,
  },
  inverse: {
    background: palette.white,
    border: palette.white,
    text: colors.textTitle,
    pressed: palette.grey100,
  },
};

export interface ButtonProps {
  children: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  disabled?: boolean;
  /** Operazione in corso: blocca i tocchi senza l'aspetto disabilitato. */
  busy?: boolean;
  icon?: ReactNode;
  onPress?: () => void;
  /** Tocco sul bottone disabilitato: serve a spiegare cosa manca. */
  onDisabledPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  block = false,
  disabled = false,
  busy = false,
  icon,
  onPress,
  onDisabledPress,
  accessibilityLabel,
  style,
}: ButtonProps) {
  const [pressed, setPressed] = useState(false);
  const tone = VARIANTS[variant];
  const dimensions = SIZES[size];
  const active = !disabled && !busy;

  const backgroundColor = disabled ? palette.grey100 : pressed && active ? tone.pressed : tone.background;
  const borderColor = disabled ? palette.grey100 : tone.border;
  const textColor = disabled ? colors.textDisabled : tone.text;

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? children}
      accessibilityState={{ disabled, busy }}
      disabled={busy || (disabled && !onDisabledPress)}
      scaleOnPress={active}
      onPress={disabled ? onDisabledPress : onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[
        styles.base,
        {
          height: dimensions.height,
          paddingHorizontal: dimensions.paddingHorizontal,
          backgroundColor,
          borderColor,
        },
        block && styles.block,
        style,
      ]}>
      {icon}
      <Text
        weight="semibold"
        color={textColor}
        numberOfLines={1}
        style={{
          fontSize: dimensions.fontSize,
          lineHeight: Math.round(dimensions.fontSize * 1.2),
          letterSpacing: dimensions.fontSize * 0.01,
        }}>
        {children}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderRadius: radii.pill,
    alignSelf: 'flex-start',
  },
  block: {
    alignSelf: 'stretch',
  },
});
