import { ChevronRight } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { Panel, StatusDot, Text, colors, palette, radii, screenStyles } from '@/design-system';
import type { BrandDraft, SectionKey } from '@shared/domain/brand';
import { ONBOARDING_SECTION_KEYS, sectionCopy, sectionStatus, sectionSummary } from '@shared/domain/sections';

export function SummaryStep({ draft, onEdit }: { draft: BrandDraft; onEdit: (key: SectionKey) => void }) {
  return (
    <View style={styles.column}>
      <Panel gap={0} style={styles.panel}>
        {ONBOARDING_SECTION_KEYS.map((key, i) => {
          const { name } = sectionCopy(key, draft.identity.kind);
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={`${name}: ${sectionSummary(key, draft)}`}
              accessibilityHint="Torna al passo per modificarlo"
              onPress={() => onEdit(key)}
              style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && styles.pressed]}>
              <View style={styles.dot}>
                <StatusDot tone={sectionStatus(key, draft)} />
              </View>
              <View style={styles.texts}>
                <Text variant="strongSmall">{name}</Text>
                <Text variant="caption">{sectionSummary(key, draft)}</Text>
              </View>
              <ChevronRight size={16} color={palette.grey300} />
            </Pressable>
          );
        })}
      </Panel>
      <Text variant="caption" style={screenStyles.groupLabel}>
        Tutto resta modificabile dal Profilo. Riferimenti e fonti li aggiungi da lì quando vuoi: danno un appiglio reale
        alle idee.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: 12 },
  panel: { borderRadius: radii.card, paddingVertical: 6 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  pressed: { opacity: 0.7 },
  dot: { paddingTop: 1 },
  texts: { flex: 1, minWidth: 0, gap: 2 },
});
