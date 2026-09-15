import { ImageIcon, Play } from 'lucide-react-native';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  Badge,
  Panel,
  ShapeTile,
  StatusDot,
  Text,
  colors,
  palette,
  radii,
  type ShapeKind,
} from '@/design-system';
import type { Brand, ChannelId } from '@/domain/brand';
import { channelName } from '@/domain/catalog';
import type { ChannelVariant, ContentVisual, VideoScene, VoiceCheck } from '@/domain/content';
import type { IdeaFormat } from '@/domain/idea';
import { BrandAvatar } from '@/features/brand-editors';

/** Testo navy o bianco, a seconda di quanto è chiaro il fondo del brand. */
function readableOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 ? palette.navy700 : palette.white;
}

const COVER_SHAPES: ShapeKind[] = ['quarter', 'circle', 'leaf', 'half'];

/** Le anteprime usano l'identità visiva del brand, non quella dell'app. */
function Cover({ brand, headline, height }: { brand: Brand; headline: string; height: number }) {
  const [primary, secondary, accent, ground] = brand.visual.palette.colors;
  const foreground = readableOn(primary);
  const style = brand.visual.imageStyle;
  return (
    <View style={[styles.cover, { backgroundColor: primary, height }]}>
      <Text variant="heading" color={foreground} numberOfLines={4}>
        {headline}
      </Text>
      {style === 'flat-geometric' && (
        <View style={styles.tiles}>
          {[secondary, accent, ground, secondary]
            .filter((color) => color.toUpperCase() !== primary.toUpperCase())
            .map((color, i) => (
              <ShapeTile key={i} kind={COVER_SHAPES[i % COVER_SHAPES.length]} color={color} ground={primary} size={36} rotation={i % 2 ? 90 : 0} />
            ))}
        </View>
      )}
      {(style === 'desaturated-photo' || style === 'natural-photo') && (
        <View style={styles.photo}>
          <ImageIcon size={18} color={palette.navy700} />
          <Text variant="caption" color={palette.navy700}>
            Foto {style === 'desaturated-photo' ? 'desaturata' : 'naturale'} generata
          </Text>
        </View>
      )}
      {brand.visual.signature && brand.visual.logoUri && (
        <View style={styles.signature}>
          <BrandAvatar brand={brand} size={20} />
        </View>
      )}
    </View>
  );
}

export function VisualPreview({ brand, format, visual }: { brand: Brand; format: IdeaFormat; visual: ContentVisual }) {
  const [primary, , , ground] = brand.visual.palette.colors;

  if (format === 'carousel') {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carousel}>
        {visual.slides.map((slide, i) => {
          const background = i % 2 === 0 ? primary : ground;
          const foreground = readableOn(background);
          return (
            <View key={i} style={[styles.slide, { backgroundColor: background }]}>
              <Text variant="caption" color={foreground}>
                {i + 1}/{visual.slides.length}
              </Text>
              <Text variant="heading" color={foreground} numberOfLines={3}>
                {slide.title}
              </Text>
              <Text variant="body" color={foreground} numberOfLines={5} style={styles.slideBody}>
                {slide.body}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    );
  }

  if (format === 'video') {
    return (
      <View style={[styles.video, { backgroundColor: primary }]}>
        <Text variant="strong" color={readableOn(primary)} numberOfLines={4}>
          {visual.headline}
        </Text>
        <View style={styles.play}>
          <Play size={20} color={palette.navy700} fill={palette.navy700} />
        </View>
        <Text variant="caption" color={readableOn(primary)}>
          {visual.scenes.reduce((sum, scene) => sum + scene.seconds, 0)} secondi · {visual.scenes.length} scene
        </Text>
      </View>
    );
  }

  return <Cover brand={brand} headline={visual.headline} height={format === 'article' ? 150 : 200} />;
}

/** Il post come apparirà sul canale: intestazione, testo, hashtag e visivo. */
export function PostPreview({
  brand,
  variant,
  format,
  visual,
  when,
}: {
  brand: Brand;
  variant: ChannelVariant;
  format: IdeaFormat;
  visual: ContentVisual;
  when: string;
}) {
  const mediaFirst: ChannelId[] = ['instagram', 'tiktok'];
  const media = <VisualPreview brand={brand} format={format} visual={visual} />;
  return (
    <View style={styles.post}>
      <View style={styles.postHeader}>
        <BrandAvatar brand={brand} size={36} />
        <View style={styles.flex}>
          <Text variant="strongSmall" numberOfLines={1}>
            {brand.identity.name}
          </Text>
          <Text variant="caption" numberOfLines={1}>
            {channelName(variant.channel)} · {when}
          </Text>
        </View>
      </View>
      {mediaFirst.includes(variant.channel) && media}
      <Text variant="bodyLarge" color={colors.textTitle} style={styles.postText}>
        {variant.text}
      </Text>
      {variant.hashtags.length > 0 && (
        <Text variant="action" color={colors.textLink}>
          {variant.hashtags.join(' ')}
        </Text>
      )}
      {!mediaFirst.includes(variant.channel) && media}
    </View>
  );
}

export function ScenesPanel({ scenes }: { scenes: VideoScene[] }) {
  return (
    <Panel label="Scene del video" gap={0}>
      {scenes.map((scene, i) => (
        <View key={i} style={[styles.scene, i > 0 && styles.divider]}>
          <View style={styles.sceneIndex}>
            <Text variant="strongSmall">{i + 1}</Text>
          </View>
          <View style={styles.flex}>
            <View style={styles.row}>
              <Text variant="strongSmall" style={styles.flex}>
                {scene.title} · {scene.seconds}s
              </Text>
              <Badge tone={scene.source === 'generated' ? 'mint' : 'yellow'} size="sm">
                {scene.source === 'generated' ? 'La genero io' : 'Da girare'}
              </Badge>
            </View>
            <Text variant="caption">{scene.description}</Text>
          </View>
        </View>
      ))}
    </Panel>
  );
}

export function VoicePanel({ check }: { check: VoiceCheck }) {
  return (
    <Panel label="Coerenza con la voce" action={<Text variant="value">{check.score}/100</Text>} gap={8}>
      {check.notes.map((note, i) => (
        <View key={i} style={styles.note}>
          <View style={styles.noteDot}>
            <StatusDot tone={note.ok ? 'complete' : 'partial'} size={10} />
          </View>
          <Text variant="caption" color={note.ok ? colors.textBody : colors.textTitle} style={styles.flex}>
            {note.text}
          </Text>
        </View>
      ))}
    </Panel>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  post: {
    gap: 12,
    padding: 14,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceCard,
  },
  postHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  postText: { lineHeight: 20 },
  cover: { borderRadius: radii.lg, padding: 16, justifyContent: 'space-between', overflow: 'hidden' },
  tiles: { flexDirection: 'row', gap: 0 },
  photo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  signature: { position: 'absolute', right: 10, bottom: 10 },
  carousel: { gap: 8 },
  slide: { width: 220, height: 220, borderRadius: radii.lg, padding: 16, gap: 8 },
  slideBody: { lineHeight: 18 },
  video: {
    alignSelf: 'center',
    width: 170,
    height: 300,
    borderRadius: radii.lg,
    padding: 14,
    justifyContent: 'space-between',
  },
  play: {
    alignSelf: 'center',
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  scene: { flexDirection: 'row', gap: 10, paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  sceneIndex: {
    width: 26,
    height: 26,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSunken,
  },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  noteDot: { paddingTop: 3 },
});
