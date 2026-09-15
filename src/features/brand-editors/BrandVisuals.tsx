import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Text, colors, palette, radii } from '@/design-system';
import type { ChannelId, Identity, Visual } from '@/domain/brand';
import { CHANNELS } from '@/domain/catalog';

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

/** Monogramma del canale: pieno se il brand lo usa, a filo se no. */
export function ChannelMark({ channel, active, size = 36 }: { channel: ChannelId; active: boolean; size?: number }) {
  const mark = CHANNELS.find(({ id }) => id === channel)?.mark ?? '';
  return (
    <View
      style={[
        styles.mark,
        { width: size, height: size, borderRadius: size / 4 },
        active ? styles.markActive : styles.markIdle,
      ]}>
      <Text
        weight="bold"
        color={active ? palette.white : colors.textBody}
        style={{ fontSize: size / 3, lineHeight: size / 3 + 3 }}>
        {mark}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  monogram: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.actionPrimary },
  swatches: { flexDirection: 'row', gap: 5 },
  swatch: { borderWidth: 1, borderColor: palette.grey100 },
  mark: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  markActive: { backgroundColor: colors.actionPrimary, borderColor: colors.actionPrimary },
  markIdle: { borderColor: colors.borderField, borderRadius: radii.sm },
});
