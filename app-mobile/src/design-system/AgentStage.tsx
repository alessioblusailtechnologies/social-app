import { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { createRng } from '@shared/lib/random';

import { StepList, type StepItem } from './Steps';
import { palette, radii } from '@shared/design-system/tokens';

/** Il fondo lunare: grigio chiaro, puntini come polvere e crateri, e la luna del marchio che sorge in un angolo. */
const GROUND = '#F1F0ED';
const DOT = palette.grey500;
const CRATER = palette.grey300;

/** Quanto può essere largo un riquadro verticale: un 9:16 a tutta larghezza sarebbe più alto dello schermo. */
const PORTRAIT_MAX = 300;

/**
 * Il lavoro dell'AI mentre succede, dentro un riquadro del formato di quello che sta facendo — un 9:16 per un video,
 * un 4:5 per una card — su un fondo a puntini lunari. I passi scorrono dentro il riquadro, e l'ultimo resta in vista.
 */
export function AgentStage({
  steps,
  waiting,
  aspect = 4 / 5,
}: {
  steps: StepItem[];
  waiting?: string;
  /** Larghezza su altezza del formato: 9/16, 4/5, 1, 1.91. */
  aspect?: number;
}) {
  const [available, setAvailable] = useState(0);
  const scroll = useRef<ScrollView>(null);
  const width = aspect < 1 ? Math.min(available, PORTRAIT_MAX) : available;
  const height = width > 0 ? Math.round(width / aspect) : 0;

  const onLayout = (event: LayoutChangeEvent) => setAvailable(Math.floor(event.nativeEvent.layout.width));

  return (
    <View style={styles.outer} onLayout={onLayout}>
      {width > 0 && (
        <View style={[styles.stage, { width, height }]}>
          <MoonDots width={width} height={height} />
          <ScrollView
            ref={scroll}
            style={StyleSheet.absoluteFill}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
            <StepList steps={steps} waiting={waiting} />
          </ScrollView>
        </View>
      )}
    </View>
  );
}

/** Stessa misura, stessi puntini: il fondo non tremola a ogni passo che arriva. */
function MoonDots({ width, height }: { width: number; height: number }) {
  const shapes = useMemo(() => {
    const rand = createRng(Math.round(width) * 7919 + Math.round(height));
    const dots = Array.from({ length: Math.round((width * height) / 900) }, () => ({
      x: rand() * width,
      y: rand() * height,
      r: 0.6 + rand() * 1.4,
      opacity: 0.18 + rand() * 0.3,
    }));
    const craters = Array.from({ length: 4 }, () => ({
      x: rand() * width,
      y: rand() * height,
      r: 10 + rand() * 26,
    }));
    return { dots, craters };
  }, [width, height]);

  const moon = Math.max(width, height) * 0.28;
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
      <Circle cx={width - moon * 0.35} cy={moon * 0.35} r={moon} fill={palette.orange500} opacity={0.1} />
      {shapes.craters.map((crater, index) => (
        <Circle key={`c${index}`} cx={crater.x} cy={crater.y} r={crater.r} fill="none" stroke={CRATER} strokeWidth={1.2} opacity={0.35} />
      ))}
      {shapes.dots.map((dot, index) => (
        <Circle key={`d${index}`} cx={dot.x} cy={dot.y} r={dot.r} fill={DOT} opacity={dot.opacity} />
      ))}
    </Svg>
  );
}

const styles = StyleSheet.create({
  outer: { alignSelf: 'stretch', alignItems: 'center' },
  stage: { borderRadius: radii.lg, overflow: 'hidden', backgroundColor: GROUND },
  content: { padding: 18, paddingTop: 22, flexGrow: 1, justifyContent: 'flex-end' },
});
