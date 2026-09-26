import {
  Text as NativeText,
  StyleSheet,
  type TextProps as NativeTextProps,
  type TextStyle,
} from 'react-native';

import {
  colors,
  fontFamily,
  typography,
  type FontWeightName,
  type TypeStyle,
  type TypographyVariant,
} from '@shared/design-system/tokens';

const MUTED_VARIANTS = new Set<string>(['body', 'caption', 'label']);

const variantStyles = StyleSheet.create(
  Object.fromEntries(
    Object.entries(typography).map(([name, definition]) => {
      const type: TypeStyle = definition;
      const style: TextStyle = {
        fontFamily: fontFamily[type.weight],
        fontSize: type.size,
        lineHeight: Math.round(type.size * type.lineHeight),
        letterSpacing: (type.tracking ?? 0) * type.size,
        textTransform: type.uppercase ? 'uppercase' : 'none',
        color: MUTED_VARIANTS.has(name) ? colors.textBody : colors.textTitle,
      };
      return [name, style];
    }),
  ) as Record<TypographyVariant, TextStyle>,
);

export interface TextProps extends NativeTextProps {
  variant?: TypographyVariant;
  color?: string;
  weight?: FontWeightName;
  align?: TextStyle['textAlign'];
}

export function Text({ variant = 'body', color, weight, align, style, ...rest }: TextProps) {
  return (
    <NativeText
      maxFontSizeMultiplier={1.5}
      {...rest}
      style={[
        variantStyles[variant],
        weight && { fontFamily: fontFamily[weight] },
        color !== undefined && { color },
        align && { textAlign: align },
        style,
      ]}
    />
  );
}
