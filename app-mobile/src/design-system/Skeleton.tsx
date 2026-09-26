import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { standardEasing } from './motion';
import { colors, radii } from '@shared/design-system/tokens';

export function SkeletonLines({ widths = [92, 100, 78, 96, 60] }: { widths?: number[] }) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.set(withRepeat(withTiming(0.5, { duration: 700, easing: standardEasing }), -1, true));
    return () => cancelAnimation(opacity);
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  return (
    <Animated.View
      style={[styles.column, animatedStyle]}
      accessibilityRole="progressbar"
      accessibilityLabel="Caricamento">
      {widths.map((width, i) => (
        <View key={i} style={[styles.line, { width: `${width}%` }]} />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  column: { gap: 12 },
  line: { height: 12, borderRadius: radii.pill, backgroundColor: colors.surfaceSunken },
});
