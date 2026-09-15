import { StyleSheet, View } from 'react-native';

import { Badge, Dot, PressableScale, Text, colors, radii, type BadgeTone } from '@/design-system';
import type { Theme } from '@/domain/brand';
import { FORMAT_LABELS, SIGNAL_LABELS, type Idea, type IdeaDraft, type IdeaSignalKind } from '@/domain/idea';

export const SIGNAL_TONES: Record<IdeaSignalKind, BadgeTone> = {
  theme: 'neutral',
  trend: 'lime',
  recurrence: 'yellow',
  season: 'coral',
  network: 'mint',
  prompt: 'navy',
  link: 'navy',
  document: 'navy',
};

/** Da dove arriva l'idea: tipo di segnale e dettaglio. */
export function IdeaSignal({ idea }: { idea: IdeaDraft }) {
  return (
    <View style={styles.signal}>
      <Badge tone={SIGNAL_TONES[idea.signal.kind]} size="sm">
        {SIGNAL_LABELS[idea.signal.kind]}
      </Badge>
      <Text variant="caption" numberOfLines={1} style={styles.flex}>
        {idea.signal.label}
      </Text>
    </View>
  );
}

/** Tema e formati suggeriti. */
export function IdeaFooter({ idea, theme }: { idea: IdeaDraft; theme: Theme | null }) {
  return (
    <View style={styles.footer}>
      {theme && <Dot color={theme.color} size={8} />}
      <Text variant="caption" color={colors.textTitle} numberOfLines={1} style={styles.flex}>
        {theme?.name ?? 'Senza tema'}
      </Text>
      <Text variant="caption" numberOfLines={1}>
        {idea.formats.map((format) => FORMAT_LABELS[format]).join(' · ')}
      </Text>
    </View>
  );
}

/** La carta grande del mazzo. */
export function IdeaCardContent({ idea, theme }: { idea: Idea; theme: Theme | null }) {
  return (
    <View style={styles.card}>
      <View style={styles.body}>
        <IdeaSignal idea={idea} />
        <Text variant="heading" numberOfLines={4}>
          {idea.title}
        </Text>
        <Text variant="body" color={colors.textTitle} numberOfLines={4} style={styles.angle}>
          {idea.angle}
        </Text>
        <View style={styles.why}>
          <Text variant="label">Perché adesso</Text>
          <Text variant="caption" numberOfLines={3}>
            {idea.rationale}
          </Text>
        </View>
        <View style={styles.spacer} />
        <IdeaFooter idea={idea} theme={theme} />
      </View>
    </View>
  );
}

/** Riga compatta della lista delle idee salvate. */
export function IdeaListItem({ idea, theme, onPress }: { idea: Idea; theme: Theme | null; onPress: () => void }) {
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel={idea.title} onPress={onPress} style={styles.item}>
      <IdeaSignal idea={idea} />
      <Text variant="strong" numberOfLines={3}>
        {idea.title}
      </Text>
      <IdeaFooter idea={idea} theme={theme} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  signal: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  card: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: radii.card,
    backgroundColor: colors.surfaceCard,
  },
  body: { flex: 1, paddingTop: 20, paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  angle: { lineHeight: 19 },
  why: { gap: 4, borderTopWidth: 1, borderTopColor: colors.borderSubtle, paddingTop: 10 },
  spacer: { flex: 1 },
  item: {
    gap: 10,
    padding: 16,
    borderRadius: radii.xl,
    backgroundColor: colors.surfaceCard,
  },
});
