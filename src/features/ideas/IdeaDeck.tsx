import { Check, X } from 'lucide-react-native';
import { useImperativeHandle, useRef, useState, type Ref } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  FadeIn,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Button, IconButton, colors, motion, palette, radii, timing } from '@/design-system';
import type { Theme } from '@/domain/brand';
import type { Idea } from '@/domain/idea';

import { IdeaCardContent } from './IdeaParts';

/** Oltre questa frazione della larghezza lo swipe decide. */
const SWIPE_RATIO = 0.28;

export type IdeaDecision = 'saved' | 'discarded';

interface SwipeCardHandle {
  fling: (direction: 1 | -1) => void;
}

interface SwipeCardProps {
  ref?: Ref<SwipeCardHandle>;
  idea: Idea;
  theme: Theme | null;
  width: number;
  onDecide: (idea: Idea, decision: IdeaDecision) => void;
  onOpen: (idea: Idea) => void;
}

/** Ogni carta ha il suo valore animato: la successiva nasce già al centro, senza salti. */
function SwipeCard({ ref, idea, theme, width, onDecide, onOpen }: SwipeCardProps) {
  const translateX = useSharedValue(0);
  const threshold = Math.max(1, width * SWIPE_RATIO);

  const decide = (decision: IdeaDecision) => onDecide(idea, decision);
  const open = () => onOpen(idea);

  // Movimento piatto, niente rotazioni né rimbalzi: la carta esce di lato e poi si registra la scelta.
  const fling = (direction: 1 | -1) => {
    'worklet';
    const decision: IdeaDecision = direction === 1 ? 'saved' : 'discarded';
    translateX.set(
      withTiming(direction * width * 1.25, timing.base, (finished) => {
        'worklet';
        if (finished) scheduleOnRN(decide, decision);
      }),
    );
  };

  useImperativeHandle(ref, () => ({ fling }));

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-24, 24])
    .onUpdate((event) => {
      translateX.set(event.translationX);
    })
    .onEnd((event) => {
      const projected = event.translationX + event.velocityX * 0.15;
      if (Math.abs(projected) > threshold) fling(projected > 0 ? 1 : -1);
      else translateX.set(withTiming(0, timing.base));
    });

  const tap = Gesture.Tap()
    .maxDuration(300)
    .onEnd((_event, success) => {
      if (success) scheduleOnRN(open);
    });

  const cardStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.get() }] }));
  const saveStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.get(), [0, threshold], [0, 1], Extrapolation.CLAMP),
  }));
  const discardStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.get(), [-threshold, 0], [1, 0], Extrapolation.CLAMP),
  }));

  return (
    <GestureDetector gesture={Gesture.Race(pan, tap)}>
      <Animated.View
        entering={FadeIn.duration(motion.base)}
        style={[styles.card, cardStyle]}
        accessible
        accessibilityRole="button"
        accessibilityLabel={idea.title}
        accessibilityHint="Scorri a destra per salvare, a sinistra per scartare"
        accessibilityActions={[
          { name: 'activate', label: 'Apri' },
          { name: 'save', label: 'Salva' },
          { name: 'discard', label: 'Scarta' },
        ]}
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === 'save') decide('saved');
          else if (nativeEvent.actionName === 'discard') decide('discarded');
          else open();
        }}>
        <IdeaCardContent idea={idea} theme={theme} />
        <Animated.View style={[styles.outline, styles.outlineSave, saveStyle]} />
        <Animated.View style={[styles.outline, styles.outlineDiscard, discardStyle]} />
      </Animated.View>
    </GestureDetector>
  );
}

export interface IdeaDeckProps {
  ideas: Idea[];
  themes: Theme[];
  onDecide: (idea: Idea, decision: IdeaDecision) => void;
  onOpen: (idea: Idea) => void;
}

/** Il mazzo delle proposte: una carta alla volta, swipe o bottoni per decidere. */
export function IdeaDeck({ ideas, themes, onDecide, onOpen }: IdeaDeckProps) {
  const [width, setWidth] = useState(0);
  const card = useRef<SwipeCardHandle>(null);
  const top = ideas[0];

  return (
    <View style={styles.deck}>
      <View style={styles.stack} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        {ideas.length > 2 && <View style={[styles.edge, styles.edgeFar]} />}
        {ideas.length > 1 && <View style={[styles.edge, styles.edgeNear]} />}
        {top && width > 0 && (
          <SwipeCard
            key={top.id}
            ref={card}
            idea={top}
            theme={themes.find((theme) => theme.id === top.themeId) ?? null}
            width={width}
            onDecide={onDecide}
            onOpen={onOpen}
          />
        )}
      </View>
      <View style={styles.actions}>
        <IconButton
          icon={X}
          variant="outline"
          size={56}
          iconSize={24}
          accessibilityLabel="Scarta l’idea"
          onPress={() => card.current?.fling(-1)}
        />
        <Button variant="secondary" onPress={() => top && onOpen(top)}>
          Apri
        </Button>
        <IconButton
          icon={Check}
          variant="solid"
          size={56}
          iconSize={24}
          accessibilityLabel="Salva l’idea"
          onPress={() => card.current?.fling(1)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  deck: { flex: 1, gap: 14 },
  stack: { flex: 1, paddingBottom: 14 },
  card: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 14 },
  edge: { position: 'absolute', borderRadius: radii.card, backgroundColor: palette.white },
  edgeNear: { left: 12, right: 12, bottom: 7, height: 40, opacity: 0.7 },
  edgeFar: { left: 26, right: 26, bottom: 0, height: 40, opacity: 0.4 },
  outline: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radii.card,
    borderWidth: 3,
    pointerEvents: 'none',
  },
  outlineSave: { borderColor: colors.statusComplete },
  outlineDiscard: { borderColor: colors.warning },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20 },
});
