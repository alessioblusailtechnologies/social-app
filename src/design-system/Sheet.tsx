import { useEffect } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Text } from './Text';
import { colors, radii } from './tokens';

/**
 * Una domanda che sale dal basso: poche scelte, una sola risposta, e si chiude.
 * Si usa quando una decisione non merita una schermata ma non deve nemmeno perdersi fra i
 * pulsanti di un pannello. Fuori dal foglio si tocca per annullare.
 */
export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** Una riga sotto il titolo che spiega la scelta, quando serve. */
  hint?: string;
  children: React.ReactNode;
}

export function Sheet({ visible, onClose, title, hint, children }: SheetProps) {
  // Sul web la scorciatoia che tutti provano per primi.
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} accessibilityRole="button" accessibilityLabel="Chiudi" onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.grip} />
        <Text variant="strong">{title}</Text>
        {hint ? <Text variant="caption">{hint}</Text> : null}
        <View style={styles.body}>{children}</View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill as object, backgroundColor: colors.scrim },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: 6,
    padding: 20,
    paddingBottom: 28,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    backgroundColor: colors.surfaceCard,
  },
  grip: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderSubtle, marginBottom: 6 },
  body: { gap: 8, marginTop: 6 },
});
