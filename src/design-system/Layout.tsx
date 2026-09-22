import { useEffect, useRef, type ReactNode } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
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

/**
 * La schermata con campi di testo: quando si apre la tastiera il contenuto si accorcia e il piede le sta sopra.
 * Anche su Android, dove l'app va da bordo a bordo e la finestra non si restringe più da sola.
 * Sul web ci pensa il browser (`interactive-widget` in public/index.html).
 */
export function KeyboardScreen({ children }: { children: ReactNode }) {
  return (
    <KeyboardAvoidingView style={screenStyles.screen} behavior={Platform.OS === 'web' ? undefined : 'padding'}>
      {children}
    </KeyboardAvoidingView>
  );
}

const NATIVE = Platform.OS !== 'web';
/** Aria fra il campo attivo e il bordo della tastiera. */
const REVEAL_MARGIN = 16;

/**
 * Lo scorrimento delle schermate con campi, dentro `KeyboardScreen`: quando la tastiera si apre, o il campo
 * cresce mentre scrivi, porta in vista il campo attivo. Sul web ci pensa il browser.
 */
export function FormScrollView({ onLayout, onScroll, onContentSizeChange, ...props }: ScrollViewProps) {
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null!);
  const viewport = useRef({ height: 0, offset: 0 });

  const reveal = () => {
    const input = TextInput.State.currentlyFocusedInput();
    const scroll = scrollRef.current;
    if (!input || !scroll || !contentRef.current) return;
    input.measureLayout(
      contentRef.current,
      (_x, y, _width, height) => {
        const { height: visible, offset } = viewport.current;
        if (visible === 0) return;
        const bottom = y + height + REVEAL_MARGIN;
        // Se il campo non ci sta tutto, conta la fine: è lì che si scrive.
        if (bottom > offset + visible) scroll.scrollTo({ y: bottom - visible, animated: true });
        else if (y - REVEAL_MARGIN < offset) scroll.scrollTo({ y: Math.max(0, y - REVEAL_MARGIN), animated: true });
      },
      () => {},
    );
  };
  const revealWhileTyping = () => {
    if (NATIVE && Keyboard.isVisible()) reveal();
  };

  useEffect(() => {
    if (!NATIVE) return;
    // Su iOS la lista si accorcia prima che la tastiera finisca di salire, su Android dopo: si guarda in entrambi i momenti.
    const subscription = Keyboard.addListener('keyboardDidShow', () => requestAnimationFrame(reveal));
    return () => subscription.remove();
  }, [reveal]);

  return (
    <ScrollView
      ref={scrollRef}
      {...(NATIVE && { innerViewRef: contentRef })}
      keyboardShouldPersistTaps="handled"
      scrollEventThrottle={32}
      {...props}
      onLayout={(event) => {
        const { height } = event.nativeEvent.layout;
        const shrunk = height < viewport.current.height;
        viewport.current.height = height;
        if (shrunk) revealWhileTyping();
        onLayout?.(event);
      }}
      onScroll={(event) => {
        viewport.current.offset = event.nativeEvent.contentOffset.y;
        onScroll?.(event);
      }}
      onContentSizeChange={(width, height) => {
        revealWhileTyping();
        onContentSizeChange?.(width, height);
      }}
    />
  );
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
