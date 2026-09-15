import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from './Text';
import { colors, layout, palette } from './tokens';

/** Sul web e sui tablet l'app resta una colonna da telefono centrata. */
export function AppFrame({ children }: { children: ReactNode }) {
  return (
    <View style={styles.outer}>
      <View style={styles.inner}>{children}</View>
    </View>
  );
}

export interface TopBarProps {
  left?: ReactNode;
  title?: string;
  right?: ReactNode;
  /** Contenuto sotto la riga, es. la barra di avanzamento. */
  children?: ReactNode;
  /** Falso nelle modali iOS, che non arrivano sotto la status bar. */
  safeArea?: boolean;
}

export function TopBar({ left, title, right, children, safeArea = true }: TopBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.topBar, { paddingTop: (safeArea ? insets.top : 0) + 12 }]}>
      <View style={styles.topBarRow}>
        {left}
        <Text variant="label" numberOfLines={1} style={styles.topBarTitle}>
          {title}
        </Text>
        {right}
      </View>
      {children}
    </View>
  );
}

export function ScreenTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.titleBlock}>
      <Text variant="title">{title}</Text>
      {subtitle ? <Text variant="body">{subtitle}</Text> : null}
    </View>
  );
}

/** Piede fisso con l'azione principale, separato dal contenuto da un filo grigio. */
export function ScreenFooter({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 18) }, style]}>{children}</View>;
}

export const screenStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surfaceApp },
  content: {
    paddingTop: 6,
    paddingHorizontal: layout.screenGutter,
    paddingBottom: 24,
    gap: 14,
  },
  groupLabel: { paddingHorizontal: 2 },
});

const styles = StyleSheet.create({
  outer: { flex: 1, alignItems: 'center', backgroundColor: colors.surfaceApp },
  inner: { flex: 1, width: '100%', maxWidth: layout.maxContentWidth },
  topBar: { paddingHorizontal: layout.screenGutter, paddingBottom: 12, gap: 12 },
  topBarRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 36 },
  topBarTitle: { flex: 1 },
  titleBlock: { gap: 6, paddingHorizontal: 2 },
  footer: {
    backgroundColor: colors.surfaceApp,
    borderTopWidth: 1,
    borderTopColor: palette.grey300,
    paddingTop: 12,
    paddingHorizontal: layout.screenGutter,
    gap: 8,
  },
});
