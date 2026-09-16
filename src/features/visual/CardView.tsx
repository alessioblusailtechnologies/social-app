import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { palette, radii } from '@/design-system';
import { ASPECT_SIZES } from '@/domain/visual';
import type { CardProps } from '@/templates';

import VisualCanvas from './VisualCanvas';

/** Una card del brand, larga quanto il suo posto (o quanto `width`). */
export function CardView({ width: fixed, style, ...card }: CardProps & { width?: number; style?: StyleProp<ViewStyle> }) {
  const [measured, setMeasured] = useState(0);
  const width = fixed ?? measured;
  const size = ASPECT_SIZES[card.aspect];
  const height = Math.round((size.height / size.width) * width);

  return (
    <View
      style={[styles.frame, { aspectRatio: size.width / size.height }, fixed !== undefined && { width: fixed }, style]}
      onLayout={fixed === undefined ? (event) => setMeasured(Math.floor(event.nativeEvent.layout.width)) : undefined}
      accessibilityRole="image"
      accessibilityLabel={card.page.text.headline || 'Card del post'}>
      {width > 0 && <VisualCanvas {...card} width={width} dom={{ style: { width, height }, scrollEnabled: false }} />}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', borderRadius: radii.lg, backgroundColor: palette.grey100 },
});
