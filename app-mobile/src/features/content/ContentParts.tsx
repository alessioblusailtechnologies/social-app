import { ImagePlus, Play } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Badge, Panel, StatusDot, Text, colors, palette, radii, type BadgeTone } from '@/design-system';
import type { Brand, ChannelId } from '@shared/domain/brand';
import { channelName } from '@shared/domain/catalog';
import {
  SCENE_SOURCES,
  SCENE_SOURCE_LABELS,
  readScene,
  videoSeconds,
  type ChannelVariant,
  type ContentVisual,
  type SceneSource,
  type VideoScene,
  type VoiceCheck,
} from '@shared/domain/content';
import type { IdeaFormat } from '@shared/domain/idea';
import { ASPECT_SIZES, VISUAL_STEP_LABELS, aspectFor, brandKit, withDesignTemplates, type Aspect, type VisualStep } from '@shared/domain/visual';
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
          {videoSeconds(visual.scenes)} secondi · {visual.scenes.length} scene
        </Text>
      </View>
    );
  }

  const { design } = visual;
  const aspect = aspectFor(channel, format);
  const carousel = (design?.pages.length ?? visual.slides.length) > 1;

  // Appena c'è un disegno la card si vede: il motore dei template la disegna dal vivo, anche prima
  // che il PNG sia composto e anche senza foto (al suo posto va una sfumatura nei colori del brand).
  // Il riquadro vuoto resta solo quando non c'è ancora niente da mostrare.
  if (!design || design.pages.length === 0) {
    const step = design?.status === 'creating' && design.step ? design.step : 'todo';
    return <VisualPlaceholder aspect={aspect} carousel={carousel} step={step} />;
  }

  // Col template disegnato per questo contenuto: senza, l'anteprima ripiega su un layout del motore
  // e mostra una card diversa da quella che esce dal render.
  const kit = withDesignTemplates(brandKit(brand), design);
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
          <CardView key={i} {...card} photoUrl={page.photo?.url || card.photoUrl} page={page} pageIndex={i} width={CAROUSEL_CARD_WIDTH} />
        ))}
      </ScrollView>
    );
  }
  return (
    <CardView
      {...card}
      photoUrl={design.pages[0].photo?.url || card.photoUrl}
      page={design.pages[0]}
      pageIndex={0}
      style={aspect === '9:16' ? styles.tall : undefined}
    />
  );
}

/** Il post come apparirà sul canale: intestazione, testo, hashtag e visivo. */
export function PostPreview({
  brand,
  variant,
  format,
  visual,
  when,
  withVisual = true,
}: {
  brand: Brand;
  variant: ChannelVariant;
  format: IdeaFormat;
  visual: ContentVisual;
  when: string;
  /** Falso al passo del testo, dove il visivo non c'entra ancora. */
  withVisual?: boolean;
}) {
  const mediaFirst: ChannelId[] = ['instagram', 'tiktok'];
  const media = withVisual ? <VisualPreview brand={brand} format={format} visual={visual} channel={variant.channel} /> : null;
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

const SCENE_TONES: Record<SceneSource, BadgeTone> = {
  shoot: 'yellow',
  photo: 'lime',
  broll: 'mint',
  graphic: 'neutral',
};

/** «2 da girare · 1 foto viva · 2 grafica»: di cosa è fatto il video, nell'ordine dei tipi. */
function sceneMix(scenes: readonly VideoScene[]): string {
  return SCENE_SOURCES.map((source) => {
    const count = scenes.filter((scene) => scene.source === source).length;
    return count > 0 ? `${count} ${SCENE_SOURCE_LABELS[source].toLowerCase()}` : null;
  })
    .filter(Boolean)
    .join(' · ');
}

/** Il Video Studio: lo script e la regia, scena per scena, con da dove arriva ogni immagine. */
export function VideoStudio({
  visual,
  renderScene,
}: {
  visual: ContentVisual;
  /** Cosa c'è sotto ogni scena: il materiale da caricare, «Non posso girarla». */
  renderScene?: (scene: VideoScene, index: number) => ReactNode;
}) {
  // Le bozze di prima hanno i due tipi di allora e nessuno script.
  const scenes = visual.scenes.map(readScene);
  return (
    <>
      {visual.script ? (
        <Panel label="Script" gap={6}>
          <Text variant="body">{visual.script}</Text>
        </Panel>
      ) : null}

      <Panel label="Regia" action={<Text variant="value">{videoSeconds(scenes)}s</Text>} gap={0}>
        <Text variant="caption" style={styles.mix}>
          {sceneMix(scenes)}
        </Text>
        {scenes.map((scene, i) => (
          <View key={i} style={[styles.scene, styles.divider]}>
            <View style={styles.sceneIndex}>
              <Text variant="strongSmall">{i + 1}</Text>
            </View>
            <View style={[styles.flex, styles.sceneBody]}>
              <View style={styles.row}>
                <Text variant="strongSmall" style={styles.flex}>
                  {scene.title} · {scene.seconds}s
                </Text>
                <Badge tone={SCENE_TONES[scene.source]} size="sm">
                  {SCENE_SOURCE_LABELS[scene.source]}
                </Badge>
              </View>
              <Text variant="caption">{scene.description}</Text>
              {scene.overlay ? (
                <Text variant="caption" color={colors.textTitle}>
                  A schermo: «{scene.overlay}»
                </Text>
              ) : null}
              {renderScene?.(scene, i)}
            </View>
          </View>
        ))}
      </Panel>
    </>
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
  mix: { paddingBottom: 10 },
  scene: { flexDirection: 'row', gap: 10, paddingVertical: 10 },
  sceneBody: { gap: 3 },
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
