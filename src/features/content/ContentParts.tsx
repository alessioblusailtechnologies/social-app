import { ImagePlus, Play } from 'lucide-react-native';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Badge, Panel, StatusDot, Text, colors, palette, radii } from '@/design-system';
import type { Brand, ChannelId } from '@/domain/brand';
import { channelName } from '@/domain/catalog';
import type { ChannelVariant, ContentVisual, VideoScene, VoiceCheck } from '@/domain/content';
import type { IdeaFormat } from '@/domain/idea';
import { ASPECT_SIZES, VISUAL_STEP_LABELS, aspectFor, brandKit, type Aspect, type VisualStep } from '@/domain/visual';
import { BrandAvatar } from '@/features/brand-editors';
import { CardView } from '@/features/visual/CardView';

/** Testo navy o bianco, a seconda di quanto è chiaro il fondo del brand. */
function readableOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 ? palette.navy700 : palette.white;
}

const CAROUSEL_CARD_WIDTH = 220;

const ratioOf = (aspect: Aspect) => ASPECT_SIZES[aspect].width / ASPECT_SIZES[aspect].height;

/** Il posto della card finché non c'è: da creare, oppure in creazione. */
function VisualPlaceholder({ aspect, carousel, step }: { aspect: Aspect; carousel: boolean; step: VisualStep | 'todo' }) {
  const creating = step !== 'todo';
  return (
    <View
      style={[
        styles.placeholder,
        creating ? styles.placeholderBusy : styles.placeholderEmpty,
        { aspectRatio: ratioOf(aspect) },
        carousel ? { width: CAROUSEL_CARD_WIDTH } : aspect === '9:16' && styles.tall,
      ]}>
      {creating ? (
        <>
          <StatusDot tone="partial" size={12} />
          <Text variant="strongSmall">Sto creando il visivo</Text>
          <Text variant="caption">{VISUAL_STEP_LABELS[step]}…</Text>
        </>
      ) : (
        <>
          <ImagePlus size={20} color={palette.grey500} />
          <Text variant="strongSmall">Visivo da creare</Text>
          <Text variant="caption" align="center">
            La proposta è nel pannello Visivo
          </Text>
        </>
      )}
    </View>
  );
}

/** Le anteprime usano l'identità visiva del brand, non quella dell'app. */
export function VisualPreview({
  brand,
  format,
  visual,
  channel,
}: {
  brand: Brand;
  format: IdeaFormat;
  visual: ContentVisual;
  channel: ChannelId;
}) {
  if (format === 'video') {
    const [primary] = brand.visual.palette.colors;
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

  const { design } = visual;
  const aspect = aspectFor(channel, format);
  const carousel = (design?.pages.length ?? visual.slides.length) > 1;

  if (!design || design.status !== 'ready') {
    const step = design?.status === 'creating' && design.step ? design.step : 'todo';
    return <VisualPlaceholder aspect={aspect} carousel={carousel} step={step} />;
  }

  const kit = brandKit(brand);
  const card = {
    kit,
    aspect,
    pageCount: design.pages.length,
    photoUrl: design.image.photo?.url ?? null,
    cutoutUrl: design.image.cutout?.url ?? null,
  };

  if (design.pages.length > 1) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carousel}>
        {design.pages.map((page, i) => (
          <CardView key={i} {...card} page={page} pageIndex={i} width={CAROUSEL_CARD_WIDTH} />
        ))}
      </ScrollView>
    );
  }
  return <CardView {...card} page={design.pages[0]} pageIndex={0} style={aspect === '9:16' ? styles.tall : undefined} />;
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
  const media = <VisualPreview brand={brand} format={format} visual={visual} channel={variant.channel} />;
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
  placeholder: { borderRadius: radii.lg, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 16 },
  placeholderEmpty: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.borderField },
  placeholderBusy: { backgroundColor: colors.surfaceSunken },
  tall: { width: '62%', alignSelf: 'center' },
  carousel: { gap: 8 },
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
