import { Pressable, StyleSheet } from 'react-native';

import { Text } from './Text';
import { colors } from '@shared/design-system/tokens';

export interface LinkButtonProps {
  label: string;
  onPress: () => void;
  tone?: 'accent' | 'muted';
}

/** Azione testuale leggera, es. "Aggiungi un tema". */
export function LinkButton({ label, onPress, tone = 'accent' }: LinkButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
      <Text variant="action" color={tone === 'accent' ? colors.textLink : colors.textBody}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: { minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start' },
  pressed: { opacity: 0.7 },
});
