import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { timing } from './motion';
import { motion } from './tokens';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  /** Press: scale(0.97), come da stati del design system. */
  scaleOnPress?: boolean;
}

export function PressableScale({
  style,
  scaleOnPress = true,
  onPressIn,
  onPressOut,
  ...rest
}: PressableScaleProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(event) => {
        if (scaleOnPress) scale.set(withTiming(motion.pressScale, timing.fast));
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        scale.set(withTiming(1, timing.fast));
        onPressOut?.(event);
      }}
      style={[style, animatedStyle]}
    />
  );
}
