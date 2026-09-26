import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from './Text';
import { colors, radii } from '@shared/design-system/tokens';

export interface PanelProps {
  /** Etichetta maiuscola in testa al pannello. */
  label?: string;
  /** Azione allineata a destra dell'etichetta. */
  action?: ReactNode;
  children?: ReactNode;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}

/** Il pannello bianco degli artboard: angoli da 20, padding 16, niente ombra sul fondo chiaro. */
export function Panel({ label, action, children, gap = 10, style }: PanelProps) {
  return (
    <View style={[styles.panel, { gap }, style]}>
      {(label || action) && (
        <View style={styles.header}>
          {label && (
            <Text variant="label" style={styles.label}>
              {label}
            </Text>
          )}
          {action}
        </View>
      )}
      {children}
    </View>
  );
}

export interface CardProps {
  /** Normalmente un PatternGrid, a filo dei bordi superiori. */
  media?: ReactNode;
  mediaHeight?: number;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Card del design system: angoli da 24, media a filo, corpo con gutter laterale 16. */
export function Card({ media, mediaHeight = 160, children, style }: CardProps) {
  return (
    <View style={[styles.card, style]}>
      {media && <View style={{ height: mediaHeight, overflow: 'hidden' }}>{media}</View>}
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surfaceCard,
    borderRadius: radii.xl,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    minHeight: 16,
  },
  label: {
    flexShrink: 1,
  },
  card: {
    backgroundColor: colors.surfaceCard,
    borderRadius: radii.card,
    overflow: 'hidden',
  },
  cardBody: {
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
});
