import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from './IconButton';
import { Text } from './Text';
import { palette } from '@shared/design-system/tokens';

export interface ViewerItem {
  key: string;
  /** L'immagine da mostrare; senza, o se non si carica, si usa `fallback`. */
  uri?: string | null;
  /** Un video: si carica e parte solo quando è la pagina che si sta guardando. */
  video?: string | null;
  /** Larghezza su altezza, se si conosce: l'immagine riempie lo schermo senza deformarsi. */
  aspectRatio?: number;
  label?: string;
  /** Quello che si disegna al posto dell'immagine, largo `width`: per esempio una card dal vivo. */
  fallback?: (width: number) => ReactNode;
}

const GUTTER = 16;
/** Lo spazio per il pulsante di chiusura in alto e la didascalia in basso. */
const CHROME = 150;

/**
 * Le immagini e i video a tutto schermo, su fondo scuro: si scorre fra le altre del gruppo col dito, con le frecce ai lati
 * (col mouse non si scorre di lato) o coi tasti freccia, e si chiude con un tocco.
 */
export function ImageViewer({ items, index, onClose }: { items: ViewerItem[]; index: number | null; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const [current, setCurrent] = useState(index ?? 0);
  const boxWidth = width - GUTTER * 2;
  const boxHeight = height - insets.top - insets.bottom - CHROME;
  const many = items.length > 1;

  const go = (next: number) => {
    const target = Math.max(0, Math.min(items.length - 1, next));
    setCurrent(target);
    scroll.current?.scrollTo({ x: target * width, animated: true });
  };

  useEffect(() => {
    if (index !== null) setCurrent(index);
  }, [index]);

  // Sul web le frecce della tastiera sfogliano, Esc chiude.
  useEffect(() => {
    if (Platform.OS !== 'web' || index === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') go(current + 1);
      else if (event.key === 'ArrowLeft') go(current - 1);
      else if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <Modal visible={index !== null} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ScrollView
          ref={scroll}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={32}
          onScroll={(event) => setCurrent(Math.round(event.nativeEvent.contentOffset.x / Math.max(1, width)))}
          onLayout={() => scroll.current?.scrollTo({ x: (index ?? 0) * width, animated: false })}>
          {items.map((item, position) => (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityLabel="Chiudi l’immagine"
              onPress={onClose}
              style={[styles.page, { width, height, paddingTop: insets.top + 56, paddingBottom: insets.bottom + 24 }]}>
              <ViewerPage item={item} boxWidth={boxWidth} boxHeight={boxHeight} active={position === current} />
              {item.label ? (
                <Text variant="caption" color={palette.white} align="center">
                  {item.label}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </ScrollView>
        {many && (
          <>
            <IconButton
              icon={ChevronLeft}
              variant="surface"
              accessibilityLabel="Immagine precedente"
              disabled={current === 0}
              onPress={() => go(current - 1)}
              style={[styles.arrow, { left: GUTTER / 2, top: height / 2 - 18 }]}
            />
            <IconButton
              icon={ChevronRight}
              variant="surface"
              accessibilityLabel="Immagine successiva"
              disabled={current === items.length - 1}
              onPress={() => go(current + 1)}
              style={[styles.arrow, { right: GUTTER / 2, top: height / 2 - 18 }]}
            />
          </>
        )}
        <IconButton
          icon={X}
          variant="surface"
          accessibilityLabel="Chiudi"
          onPress={onClose}
          style={[styles.close, { top: insets.top + 12 }]}
        />
      </View>
    </Modal>
  );
}

function ViewerPage({ item, boxWidth, boxHeight, active }: { item: ViewerItem; boxWidth: number; boxHeight: number; active: boolean }) {
  const [broken, setBroken] = useState(false);
  // Con la proporzione nota l'immagine occupa tutto lo spazio possibile; senza, sta dentro il riquadro.
  const fit = item.aspectRatio
    ? { width: Math.min(boxWidth, boxHeight * item.aspectRatio), height: Math.min(boxHeight, boxWidth / item.aspectRatio) }
    : { width: boxWidth, height: boxHeight };
  if (item.video) {
    // Un tocco sul video lo comanda, non chiude il visore: i controlli stanno sul video.
    return (
      <Pressable onPress={(event) => event.stopPropagation()} style={fit}>
        {active ? <ViewerVideo uri={item.video} style={fit} /> : <View style={[fit, styles.videoIdle]} />}
      </Pressable>
    );
  }
  if (item.uri && !broken) {
    return <Image source={{ uri: item.uri }} contentFit="contain" style={fit} onError={() => setBroken(true)} />;
  }
  return <View style={fit}>{item.fallback?.(fit.width)}</View>;
}

function ViewerVideo({ uri, style }: { uri: string; style: { width: number; height: number } }) {
  const player = useVideoPlayer(uri, (created) => {
    created.loop = true;
    created.play();
  });
  return <VideoView player={player} style={style} nativeControls contentFit="contain" />;
}

const styles = StyleSheet.create({
  videoIdle: { backgroundColor: 'rgba(255,255,255,0.06)' },
  backdrop: { flex: 1, backgroundColor: 'rgba(12,14,24,0.94)' },
  page: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  close: { position: 'absolute', right: GUTTER },
  arrow: { position: 'absolute' },
});
