import { useState, type ReactNode } from 'react';
import { StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';

import { Text } from './Text';
import { colors, fontFamily, radii } from '@shared/design-system/tokens';

export interface FieldCardProps extends Omit<TextInputProps, 'style'> {
  label: string;
  /** Azione accanto al campo, es. "Leggi" per il sito. */
  action?: ReactNode;
  /** Nota sotto il campo, es. da dove viene il testo proposto. */
  hint?: string;
}

/** Campo dentro una card bianca con etichetta maiuscola, come negli artboard. */
export function FieldCard({ label, action, hint, multiline, onFocus, onBlur, ...input }: FieldCardProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.card, focused && styles.cardFocused]}>
      <Text variant="label">{label}</Text>
      <View style={styles.row}>
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={colors.textBody}
          {...input}
          multiline={multiline}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={[styles.input, multiline && styles.multiline]}
        />
        {action}
      </View>
      {hint ? <Text variant="caption">{hint}</Text> : null}
    </View>
  );
}

export interface SunkenInputProps extends Omit<TextInputProps, 'style'> {
  minHeight?: number;
  style?: StyleProp<ViewStyle>;
}

/** Campo incassato nel grigio, per input dentro un pannello bianco. */
export function SunkenInput({ multiline, minHeight = 96, style, ...input }: SunkenInputProps) {
  return (
    <View style={[styles.sunken, style]}>
      <TextInput
        placeholderTextColor={colors.textBody}
        {...input}
        multiline={multiline}
        style={[styles.sunkenInput, multiline && { minHeight, textAlignVertical: 'top', paddingVertical: 12 }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceCard,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 4,
  },
  cardFocused: { borderColor: colors.borderStrong },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 26,
    padding: 0,
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textTitle,
    outlineWidth: 0,
  },
  multiline: { minHeight: 78, lineHeight: 22, textAlignVertical: 'top', alignSelf: 'stretch' },
  sunken: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    minHeight: 44,
    justifyContent: 'center',
  },
  sunkenInput: {
    padding: 0,
    minHeight: 44,
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textTitle,
    outlineWidth: 0,
  },
});
