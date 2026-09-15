import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Text, colors, palette } from '@/design-system';
import type { ChannelId, Identity, Visual } from '@/domain/brand';
import { channelName } from '@/domain/catalog';

import { CHANNEL_ICONS } from './channel-icons';

/** Logo del brand o, in sua assenza, le iniziali in navy. */
export function BrandAvatar({
  brand,
  size = 48,
}: {
  brand: { identity: Pick<Identity, 'name'>; visual: Pick<Visual, 'logoUri'> };
  size?: number;
}) {
  const radius = size / 4;
  if (brand.visual.logoUri) {
    return (
      <Image
        source={{ uri: brand.visual.logoUri }}
        contentFit="contain"
        accessibilityLabel={`Logo di ${brand.identity.name}`}
        style={{ width: size, height: size, borderRadius: radius, backgroundColor: palette.white }}
      />
    );
  }
  const initials =
    brand.identity.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word.charAt(0).toUpperCase())
      .join('') || '?';
  return (
    <View style={[styles.monogram, { width: size, height: size, borderRadius: radius }]}>
      <Text weight="bold" color={palette.white} style={{ fontSize: size * 0.34, lineHeight: size * 0.42 }}>
        {initials}
      </Text>
    </View>
  );
}

export function Swatches({ colors: swatches, size = 18 }: { colors: readonly string[]; size?: number }) {
  return (
    <View style={styles.swatches}>
      {swatches.map((color, i) => (
        <View
          key={`${color}-${i}`}
          style={[styles.swatch, { width: size, height: size, borderRadius: size * 0.28, backgroundColor: color }]}
        />
      ))}
    </View>
  );
}

/** Il logo vero del canale: nel colore del marchio se il brand lo usa, grigio se no. */
export function ChannelMark({ channel, active, size = 36 }: { channel: ChannelId; active: boolean; size?: number }) {
  const icon = CHANNEL_ICONS[channel];
  const glyph = Math.round(size * 0.78);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={channelName(channel)}
      style={[styles.mark, { width: size, height: size }]}>
      <Svg width={glyph} height={glyph} viewBox="0 0 24 24">
        <Path d={icon.path} fill={active ? icon.color : palette.grey300} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  monogram: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.actionPrimary },
  swatches: { flexDirection: 'row', gap: 5 },
  swatch: { borderWidth: 1, borderColor: palette.grey100 },
  mark: { alignItems: 'center', justifyContent: 'center' },
});
