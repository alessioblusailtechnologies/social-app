import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from './Text';
import { colors, palette, radii } from '@shared/design-system/tokens';

export type BadgeTone = 'navy' | 'coral' | 'lime' | 'mint' | 'yellow' | 'neutral';

const TONES: Record<BadgeTone, { background: string; text: string }> = {
  navy: { background: palette.navy700, text: palette.white },
  coral: { background: palette.orange500, text: palette.white },
  // Mai testo bianco su lime, mint o giallo.
  lime: { background: palette.lime400, text: palette.navy700 },
  mint: { background: palette.mint400, text: palette.navy700 },
  yellow: { background: palette.yellow400, text: palette.navy700 },
  neutral: { background: palette.grey100, text: palette.navy700 },
};

export interface BadgeProps {
  children: string;
  tone?: BadgeTone;
  outline?: boolean;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
}

export function Badge({ children, tone = 'navy', outline = false, size = 'md', style }: BadgeProps) {
  const colorsFor = TONES[tone];
  const small = size === 'sm';
  return (
    <View
      style={[
        styles.base,
        small ? styles.small : styles.medium,
        outline
          ? { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.borderStrong }
          : { backgroundColor: colorsFor.background },
        style,
      ]}>
      <Text
        variant="label"
        color={outline ? colors.textTitle : colorsFor.text}
        numberOfLines={1}
        style={small ? styles.smallText : styles.mediumText}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.pill,
  },
  medium: { height: 24, paddingHorizontal: 12 },
  small: { height: 20, paddingHorizontal: 9 },
  mediumText: { fontSize: 11, lineHeight: 14, letterSpacing: 0.88 },
  smallText: { fontSize: 9, lineHeight: 12, letterSpacing: 0.54 },
});
