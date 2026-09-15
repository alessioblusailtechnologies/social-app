import { StyleSheet, View } from 'react-native';

import {
  Badge,
  Dot,
  Panel,
  PressableScale,
  StackedBar,
  Text,
  colors,
  radii,
  type BadgeTone,
} from '@/design-system';
import type { Theme } from '@/domain/brand';
import type { Idea } from '@/domain/idea';
import { balanceHint, SLOT_STATUS_LABELS, themeBalance, type SlotDraft, type SlotStatus } from '@/domain/plan';
import { ChannelMark } from '@/features/brand-editors';

export const SLOT_TONES: Record<SlotStatus, BadgeTone> = {
  empty: 'neutral',
  toPrepare: 'yellow',
  toApprove: 'coral',
  scheduled: 'navy',
  published: 'mint',
};

export interface SlotCardProps {
  slot: SlotDraft & { status: SlotStatus };
  idea: Idea | null;
  theme: Theme | null;
  onPress: () => void;
  /** Mostra l'azione "Scegli un'idea" sulle uscite vuote. */
  onFill?: () => void;
}

export function SlotCard({ slot, idea, theme, onPress, onFill }: SlotCardProps) {
  const label = idea ? idea.title : theme ? `Serve un contenuto su «${theme.name}»` : 'Serve un contenuto';
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${slot.time}, ${SLOT_STATUS_LABELS[slot.status]}. ${label}`}
      onPress={onPress}
      style={[styles.card, !idea && styles.cardEmpty]}>
      <View style={styles.row}>
        <Text variant="strongSmall">{slot.time}</Text>
        <View style={styles.marks}>
          {slot.channels.map((channel) => (
            <ChannelMark key={channel} channel={channel} active size={24} />
          ))}
        </View>
        <View style={styles.flex} />
        <Badge tone={SLOT_TONES[slot.status]} size="sm">
          {SLOT_STATUS_LABELS[slot.status]}
        </Badge>
      </View>
      {idea ? (
        <Text variant="strong" numberOfLines={2}>
          {idea.title}
        </Text>
      ) : (
        <Text variant="body">{label}</Text>
      )}
      <View style={styles.row}>
        {theme && <Dot color={theme.color} size={8} />}
        <Text variant="caption" numberOfLines={1} style={styles.flex}>
          {theme?.name ?? 'Senza tema'}
        </Text>
        {/* Solo testo: tutta la card apre già l'uscita, e un toccabile dentro un toccabile non è valido sul web. */}
        {!idea && onFill && (
          <Text variant="action" color={colors.textLink}>
            Scegli un’idea
          </Text>
        )}
      </View>
    </PressableScale>
  );
}

/** Pesi del profilo contro uscite pianificate, con l'avviso sul tema più scoperto. */
export function BalancePanel({ themes, slots, label }: { themes: Theme[]; slots: SlotDraft[]; label: string }) {
  const balance = themeBalance(themes, slots);
  const planned = balance.some((entry) => entry.count > 0);
  const hint = planned ? balanceHint(balance) : null;

  return (
    <Panel label={label} gap={10}>
      <View style={styles.balanceRow}>
        <Text variant="caption" style={styles.balanceLabel}>
          Profilo
        </Text>
        <View style={styles.flex}>
          <StackedBar segments={balance.map((entry) => ({ value: entry.target, color: entry.theme.color }))} />
        </View>
      </View>
      <View style={styles.balanceRow}>
        <Text variant="caption" style={styles.balanceLabel}>
          Piano
        </Text>
        <View style={styles.flex}>
          <StackedBar segments={balance.map((entry) => ({ value: entry.count, color: entry.theme.color }))} />
        </View>
      </View>
      <Text variant="caption" color={hint ? colors.warning : colors.textBody}>
        {hint ?? (planned ? 'In linea con i pesi del profilo.' : 'Nessuna uscita con un tema in questo periodo.')}
      </Text>
    </Panel>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  card: {
    gap: 8,
    padding: 14,
    borderRadius: radii.xl,
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: colors.surfaceCard,
  },
  cardEmpty: { borderStyle: 'dashed', borderColor: colors.borderField, backgroundColor: 'transparent' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  marks: { flexDirection: 'row', gap: 4 },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  balanceLabel: { width: 48 },
});
