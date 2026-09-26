import { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { timing } from './motion';
import { palette, radii, shadows } from '@shared/design-system/tokens';

const TRACK_WIDTH = 52;
const KNOB = 26;
const PADDING = 3;
const TRAVEL = TRACK_WIDTH - KNOB - PADDING * 2;

export interface SwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel: string;
  disabled?: boolean;
}

/** L'unico controllo in cui un accento (mint) porta uno stato. */
export function Switch({ value, onValueChange, accessibilityLabel, disabled = false }: SwitchProps) {
  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    progress.set(withTiming(value ? 1 : 0, timing.base));
  }, [value, progress]);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.get(), [0, 1], [palette.grey300, palette.mint400]),
  }));
  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: progress.get() * TRAVEL }] }));

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={() => onValueChange(!value)}>
      <Animated.View style={[styles.track, trackStyle, disabled && styles.disabled]}>
        <Animated.View style={[styles.knob, knobStyle]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: TRACK_WIDTH,
    height: 32,
    borderRadius: radii.pill,
    padding: PADDING,
    justifyContent: 'center',
  },
  knob: {
    width: KNOB,
    height: KNOB,
    borderRadius: radii.pill,
    backgroundColor: palette.white,
    boxShadow: shadows.knob,
  },
  disabled: { opacity: 0.5 },
});
