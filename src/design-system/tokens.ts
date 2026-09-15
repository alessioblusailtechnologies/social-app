/**
 * Token del design system "Modulo".
 * Fonte: design/_ds/modulo-design-system-.../tokens/*.css e i valori usati negli
 * artboard (design/Onboarding.dc.html), che vincono dove i due divergono.
 */

export const palette = {
  indigo900: '#1C2150',
  navy700: '#2F3452',
  navy500: '#454B6E',
  orange500: '#FF6B35',
  lime400: '#D9E05B',
  mint400: '#6DD47E',
  yellow400: '#FFC600',
  grey100: '#ECEEEF',
  grey300: '#CDD1D4',
  grey500: '#8A8F9A',
  white: '#FFFFFF',
  black: '#000000',
} as const;

export const colors = {
  // Gli artboard dell'app usano il fondo grigio chiaro, non l'indigo del readme.
  surfaceApp: palette.grey100,
  surfaceCard: palette.white,
  surfaceSunken: palette.grey100,
  surfaceInverse: palette.navy700,
  scrim: 'rgba(28,33,80,0.55)',

  textTitle: palette.navy700,
  textBody: palette.grey500,
  textOnDark: palette.white,
  textOnDarkMuted: 'rgba(255,255,255,0.72)',
  textDisabled: palette.grey300,
  textLink: palette.orange500,

  borderSubtle: palette.grey100,
  borderStrong: palette.navy700,
  borderField: palette.grey300,

  actionPrimary: palette.navy700,
  actionPrimaryPress: '#1C2138',
  actionAccent: palette.orange500,
  actionAccentPress: '#DB4E1B',

  statusComplete: palette.mint400,
  statusPartial: palette.yellow400,
  statusMissing: palette.grey300,
  warning: palette.orange500,
} as const;

/** Le sole tinte che un modulo geometrico può assumere. */
export const shapeColors = [
  palette.orange500,
  palette.lime400,
  palette.mint400,
  palette.yellow400,
  palette.navy700,
  palette.grey100,
] as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  card: 24,
  pill: 9999,
} as const;

export const layout = {
  screenGutter: 20,
  cardPadding: 16,
  hitMin: 44,
  /** Sul web l'app resta una colonna da telefono. */
  maxContentWidth: 520,
} as const;

export const fontFamily = {
  regular: 'Archivo_400Regular',
  medium: 'Archivo_500Medium',
  semibold: 'Archivo_600SemiBold',
  bold: 'Archivo_700Bold',
} as const;

export type FontWeightName = keyof typeof fontFamily;

export interface TypeStyle {
  weight: FontWeightName;
  size: number;
  /** Interlinea relativa, come nei CSS. */
  lineHeight: number;
  /** Tracking in em, come nei CSS. */
  tracking?: number;
  uppercase?: boolean;
}

export const typography = {
  display: { weight: 'bold', size: 32, lineHeight: 1.18, tracking: -0.015 },
  title: { weight: 'bold', size: 23, lineHeight: 1.18, tracking: -0.015 },
  heading: { weight: 'bold', size: 19, lineHeight: 1.22, tracking: -0.015 },
  value: { weight: 'bold', size: 15, lineHeight: 1.2 },
  bodyLarge: { weight: 'regular', size: 14, lineHeight: 1.5 },
  body: { weight: 'regular', size: 12, lineHeight: 1.7 },
  caption: { weight: 'regular', size: 11, lineHeight: 1.55 },
  strong: { weight: 'semibold', size: 13, lineHeight: 1.35 },
  strongSmall: { weight: 'semibold', size: 12, lineHeight: 1.35 },
  action: { weight: 'medium', size: 12, lineHeight: 1.2 },
  label: { weight: 'semibold', size: 10, lineHeight: 1.3, tracking: 0.08, uppercase: true },
} satisfies Record<string, TypeStyle>;

export type TypographyVariant = keyof typeof typography;

export const shadows = {
  card: '0 18px 48px rgba(15,19,48,0.28)',
  toast: '0 10px 24px rgba(28,33,80,0.4)',
  knob: '0 1px 3px rgba(28,33,80,0.3)',
} as const;

export const motion = {
  fast: 120,
  base: 200,
  slow: 320,
  /** cubic-bezier(.2,0,.2,1) */
  easing: [0.2, 0, 0.2, 1] as const,
  pressScale: 0.97,
} as const;
