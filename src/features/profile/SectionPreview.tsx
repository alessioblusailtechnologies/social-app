import { StyleSheet, View } from 'react-native';

import {
  Badge,
  Chip,
  ChipGroup,
  Dot,
  PressableScale,
  StackedBar,
  StatusDot,
  Text,
  colors,
  radii,
  type StatusTone,
} from '@/design-system';
import { currentVoiceCard, isConnected, type Brand, type SectionKey } from '@/domain/brand';
import { CHANNELS, imageStyleLabel, typographyName } from '@/domain/catalog';
import { identityLine, sectionCopy, sectionSummary } from '@/domain/sections';
import { BrandAvatar, ChannelMark, Swatches } from '@/features/brand-editors';
import { formatDay } from '@/lib/dates';

export interface SectionPreviewProps {
  sectionKey: SectionKey;
  brand: Brand;
  status: StatusTone;
  onPress: () => void;
}

export function SectionPreview({ sectionKey, brand, status, onPress }: SectionPreviewProps) {
  const { name } = sectionCopy(sectionKey, brand.identity.kind);
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel={`${name}. Modifica`} onPress={onPress} style={styles.card}>
      <View style={styles.header}>
        <StatusDot tone={status} size={10} />
        <Text variant="label" style={styles.flex}>
          {name}
        </Text>
        <Text variant="action" color={colors.textLink}>
          Modifica
        </Text>
      </View>
      <PreviewBody sectionKey={sectionKey} brand={brand} />
    </PressableScale>
  );
}

function PreviewBody({ sectionKey, brand }: { sectionKey: SectionKey; brand: Brand }) {
  switch (sectionKey) {
    case 'identity':
      return (
        <View style={styles.stack}>
          <Text variant="strongSmall">{identityLine(brand)}</Text>
          <Text variant="caption">{brand.identity.site || 'Nessun sito'}</Text>
        </View>
      );

    case 'positioning': {
      const { goals, audiences, postsPerWeek } = brand.positioning;
      return (
        <View style={styles.stack}>
          <ChipGroup>
            {goals.map((goal) => (
              <Chip key={goal} label={goal} size="sm" selected />
            ))}
            {audiences.map((audience) => (
              <Chip key={audience} label={audience} size="sm" />
            ))}
          </ChipGroup>
          <Text variant="caption">
            {postsPerWeek} {postsPerWeek === 1 ? 'uscita' : 'uscite'} a settimana
          </Text>
        </View>
      );
    }

    case 'channels': {
      const selected = CHANNELS.filter(({ id }) => brand.channels[id].selected);
      return (
        <View style={styles.stack}>
          {selected.length > 0 && (
            <View style={styles.row}>
              {selected.map(({ id }) => (
                <ChannelMark key={id} channel={id} active={isConnected(brand.channels[id])} size={32} />
              ))}
            </View>
          )}
          <Text variant="caption">{sectionSummary('channels', brand)}</Text>
        </View>
      );
    }

    case 'themes':
      return (
        <View style={styles.stack}>
          <StackedBar segments={brand.themes.map((theme) => ({ value: theme.weight, color: theme.color }))} />
          {brand.themes.map((theme) => (
            <View key={theme.id} style={styles.legendRow}>
              <Dot color={theme.color} size={8} />
              <Text variant="caption" color={colors.textTitle} numberOfLines={1} style={styles.flex}>
                {theme.name}
              </Text>
              <Text variant="strongSmall">{theme.weight}%</Text>
            </View>
          ))}
        </View>
      );

    case 'voice': {
      const card = currentVoiceCard(brand.voice);
      if (!card) return <Text variant="caption">Nessuna scheda voce: fammi leggere qualche testo.</Text>;
      return (
        <View style={styles.stack}>
          <View style={styles.row}>
            <Badge tone="mint" size="sm">{`Scheda voce v${card.version}`}</Badge>
            <Text variant="caption" numberOfLines={1} style={styles.flex}>
              da {card.sourceLabel}
            </Text>
          </View>
          <Text variant="body" color={colors.textTitle} numberOfLines={2} style={styles.bodyText}>
            {card.register}
          </Text>
        </View>
      );
    }

    case 'visual': {
      const { logoUri, palette, imageStyle, typography } = brand.visual;
      return (
        <View style={styles.row}>
          {logoUri ? <BrandAvatar brand={brand} size={40} /> : null}
          <View style={[styles.flex, styles.stack]}>
            <Swatches colors={palette.colors} size={16} />
            <Text variant="caption">
              {palette.name} · caratteri {typographyName(typography).toLowerCase()} · {imageStyleLabel(imageStyle).toLowerCase()}
              {logoUri ? '' : ' · nessun logo'}
            </Text>
          </View>
        </View>
      );
    }

    case 'references': {
      const { milestones } = brand.references;
      const latest = milestones[milestones.length - 1];
      return (
        <View style={styles.stack}>
          <Text variant="caption">{sectionSummary('references', brand)}</Text>
          {latest && (
            <Text variant="strongSmall">
              {latest.label} · {formatDay(latest.date)}
            </Text>
          )}
        </View>
      );
    }
  }
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceCard,
    borderRadius: radii.xl,
    padding: 16,
    gap: 12,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1, minWidth: 0 },
  stack: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bodyText: { lineHeight: 19 },
});
