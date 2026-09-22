import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  Badge,
  Button,
  Card,
  Dot,
  IconButton,
  LinkButton,
  Panel,
  SegmentedControl,
  SkeletonLines,
  Text,
  TopBar,
  colors,
  layout,
  palette,
  radii,
  screenStyles,
} from '@/design-system';
import type { Brand } from '@/domain/brand';
import { channelName } from '@/domain/catalog';
import type { Content } from '@/domain/content';
import { FORMAT_LABELS } from '@/domain/idea';
import type { PlanSlot } from '@/domain/plan';
import {
  addDays,
  addMonths,
  formatMonth,
  formatRange,
  formatWeekdayLong,
  formatWeekdayShort,
  startOfMonth,
  startOfWeek,
  today,
  weekdayIndex,
} from '@/lib/dates';
import { useContentDrafts, useIdeas, usePlan } from '@/services/queries';

import { BalancePanel, SlotCard } from './PlanParts';

type PlanView = 'day' | 'week' | 'month';

const WEEKDAY_INITIALS = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];

const NAVIGATION: Record<PlanView, { previous: string; next: string; back: string }> = {
  day: { previous: 'Giorno precedente', next: 'Giorno successivo', back: 'Torna a oggi' },
  week: { previous: 'Settimana precedente', next: 'Settimana successiva', back: 'Torna a questa settimana' },
  month: { previous: 'Mese precedente', next: 'Mese successivo', back: 'Torna a questo mese' },
};

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function relativeDay(day: string, now: string): string | null {
  if (day === now) return 'Oggi';
  if (day === addDays(now, 1)) return 'Domani';
  if (day === addDays(now, -1)) return 'Ieri';
  return null;
}

export function PlanScreen({ brand }: { brand: Brand }) {
  const router = useRouter();
  const planQuery = usePlan(brand.id);
  const { data: ideas = [] } = useIdeas(brand.id);
  const { data: drafts = [] } = useContentDrafts(brand.id);
  const now = today();
  const [view, setView] = useState<PlanView>('week');
  // Un solo giorno di riferimento: la vista giornaliera mostra lui, le altre la sua settimana o il suo mese.
  const [anchor, setAnchor] = useState(now);

  const slots = planQuery.data ?? [];
  const ideaOf = (slot: PlanSlot) => ideas.find((idea) => idea.id === slot.ideaId) ?? null;
  const themeOf = (slot: PlanSlot) => brand.themes.find((theme) => theme.id === slot.themeId) ?? null;
  const openSlot = (slot: PlanSlot) => router.push({ pathname: '/content/[slotId]', params: { slotId: slot.id } });
  const openDraft = (draft: Content) => router.push({ pathname: '/draft/[contentId]', params: { contentId: draft.id } });

  const weekStart = startOfWeek(anchor);
  const weekEnd = addDays(weekStart, 6);
  const month = startOfMonth(anchor);
  const daySlots = slots.filter((slot) => slot.date === anchor);
  const weekSlots = slots.filter((slot) => slot.date >= weekStart && slot.date <= weekEnd);
  const monthSlots = slots.filter((slot) => slot.date.startsWith(month.slice(0, 7)));
  const filled = weekSlots.filter((slot) => slot.ideaId !== null || Boolean(slot.contentTitle)).length;
  const target = Math.max(brand.positioning.postsPerWeek, weekSlots.length);

  const current = { day: anchor === now, week: weekStart === startOfWeek(now), month: month === startOfMonth(now) }[view];
  const heading = {
    day: capitalize(formatWeekdayLong(anchor)),
    week: formatRange(weekStart, weekEnd),
    month: formatMonth(month),
  }[view];
  const caption = {
    day: relativeDay(anchor, now),
    week: current ? 'Questa settimana' : null,
    month: current ? 'Questo mese' : null,
  }[view];

  const step = (direction: 1 | -1) =>
    setAnchor(
      view === 'day'
        ? addDays(anchor, direction)
        : view === 'week'
          ? addDays(anchor, 7 * direction)
          : addMonths(anchor, direction),
    );

  const openDay = (day: string) => {
    setAnchor(day);
    setView('day');
  };

  const renderSlot = (slot: PlanSlot) => (
    <SlotCard
      key={slot.id}
      slot={slot}
      idea={ideaOf(slot)}
      theme={themeOf(slot)}
      onPress={() => openSlot(slot)}
      onFill={() => openSlot(slot)}
    />
  );

  return (
    <View style={screenStyles.screen}>
      <TopBar
        left={<Text variant="title">Piano</Text>}
        right={
          <Button size="sm" onPress={() => router.push('/plan-session')}>
            Pianifica
          </Button>
        }
      />

      <View style={styles.controls}>
        <SegmentedControl
          accessibilityLabel="Vista del piano"
          value={view}
          onChange={setView}
          options={[
            { value: 'day', label: 'Giorno' },
            { value: 'week', label: 'Settimana' },
            { value: 'month', label: 'Mese' },
          ]}
        />
        <View style={styles.navigator}>
          <IconButton icon={ChevronLeft} accessibilityLabel={NAVIGATION[view].previous} onPress={() => step(-1)} />
          <View style={styles.navigatorLabel}>
            <Text variant="strong" align="center">
              {heading}
            </Text>
            {caption && (
              <Text variant="caption" align="center">
                {caption}
              </Text>
            )}
          </View>
          <IconButton icon={ChevronRight} accessibilityLabel={NAVIGATION[view].next} onPress={() => step(1)} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {planQuery.isPending ? (
          <Panel gap={12}>
            <SkeletonLines widths={[70, 100, 84]} />
          </Panel>
        ) : view === 'day' ? (
          <>
            <DraftsPanel drafts={drafts} onOpen={openDraft} />
            {daySlots.length === 0 ? (
              <Card>
                <View style={styles.empty}>
                  <Text variant="heading">{anchor === now ? 'Oggi non esce niente' : 'Nessuna uscita in questo giorno'}</Text>
                  <Text variant="body">Guarda un altro giorno, oppure pianifica le prossime settimane con le tue idee salvate.</Text>
                  <Button block variant="secondary" onPress={() => router.push('/plan-session')}>
                    Pianifica
                  </Button>
                </View>
              </Card>
            ) : (
              daySlots.map(renderSlot)
            )}
          </>
        ) : view === 'week' ? (
          <>
            <DraftsPanel drafts={drafts} onOpen={openDraft} />
            <BalancePanel themes={brand.themes} slots={weekSlots} label={`${filled} di ${target} uscite con un contenuto`} />

            {weekSlots.length === 0 ? (
              <Card>
                <View style={styles.empty}>
                  <Text variant="heading">Settimana libera</Text>
                  <Text variant="body">
                    Con la sessione di pianificazione distribuisco le uscite nei giorni migliori e le riempio con le
                    tue idee salvate, rispettando quanto spesso devono uscire i temi.
                  </Text>
                  <Button block onPress={() => router.push('/plan-session')}>
                    Pianifica
                  </Button>
                </View>
              </Card>
            ) : (
              Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((day) => {
                const slotsOfDay = weekSlots.filter((slot) => slot.date === day);
                if (slotsOfDay.length === 0 && day !== now) return null;
                return (
                  <View key={day} style={styles.day}>
                    <View style={styles.dayHeader}>
                      <Text variant="label" color={day === now ? colors.textTitle : colors.textBody}>
                        {formatWeekdayShort(day)}
                      </Text>
                      {day === now && (
                        <Badge tone="navy" size="sm">
                          Oggi
                        </Badge>
                      )}
                    </View>
                    {slotsOfDay.length === 0 ? (
                      <Text variant="caption">Nessuna uscita oggi.</Text>
                    ) : (
                      slotsOfDay.map(renderSlot)
                    )}
                  </View>
                );
              })
            )}
          </>
        ) : (
          <>
            <Panel gap={8}>
              <View style={styles.gridRow}>
                {WEEKDAY_INITIALS.map((initial, i) => (
                  <Text key={i} variant="label" align="center" style={styles.cell}>
                    {initial}
                  </Text>
                ))}
              </View>
              <View style={styles.grid}>
                {Array.from({ length: weekdayIndex(month) - 1 }, (_, i) => (
                  <View key={`lead-${i}`} style={styles.cell} />
                ))}
                {Array.from({ length: 31 }, (_, i) => addDays(month, i))
                  .filter((day) => day.startsWith(month.slice(0, 7)))
                  .map((day) => {
                    const slotsOfDay = monthSlots.filter((slot) => slot.date === day);
                    return (
                      <Pressable
                        key={day}
                        accessibilityRole="button"
                        accessibilityLabel={`${formatWeekdayShort(day)}, ${slotsOfDay.length} uscite`}
                        onPress={() => openDay(day)}
                        style={styles.cell}>
                        <View style={[styles.dayNumber, day === now && styles.today]}>
                          <Text variant="strongSmall" color={day === now ? palette.white : colors.textTitle}>
                            {Number(day.slice(8))}
                          </Text>
                        </View>
                        <View style={styles.dots}>
                          {slotsOfDay.slice(0, 3).map((slot) => (
                            <Dot key={slot.id} size={6} color={themeOf(slot)?.color ?? palette.grey300} />
                          ))}
                        </View>
                      </Pressable>
                    );
                  })}
              </View>
            </Panel>
            <BalancePanel themes={brand.themes} slots={monthSlots} label={`${monthSlots.length} uscite nel mese`} />
            <Text variant="caption" style={screenStyles.groupLabel}>
              Tocca un giorno per vederne le uscite.
            </Text>
          </>
        )}

        {!planQuery.isPending && !current && <LinkButton label={NAVIGATION[view].back} onPress={() => setAnchor(now)} />}
      </ScrollView>
    </View>
  );
}

/** I contenuti creati direttamente e non ancora programmati: stanno in cima, qualunque giorno guardi. */
function DraftsPanel({ drafts, onOpen }: { drafts: Content[]; onOpen: (draft: Content) => void }) {
  if (drafts.length === 0) return null;
  return (
    <Panel label="Bozze da programmare" gap={0}>
      {drafts.map((draft, i) => (
        <Pressable
          key={draft.id}
          accessibilityRole="button"
          accessibilityLabel={`Bozza: ${draft.title}`}
          onPress={() => onOpen(draft)}
          style={[styles.draftRow, i > 0 && styles.draftDivider]}>
          <View style={styles.draftText}>
            <Text variant="strongSmall" numberOfLines={2}>
              {draft.title}
            </Text>
            <Text variant="caption">
              {draft.channels.map(channelName).join(' · ')} · {FORMAT_LABELS[draft.format]}
            </Text>
          </View>
          <ChevronRight size={16} color={palette.grey300} />
        </Pressable>
      ))}
    </Panel>
  );
}

const styles = StyleSheet.create({
  controls: { gap: 8, paddingHorizontal: layout.screenGutter, paddingBottom: 8 },
  navigator: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  navigatorLabel: { flex: 1, minHeight: 36, justifyContent: 'center' },
  content: { paddingHorizontal: layout.screenGutter, paddingBottom: 24, gap: 14 },
  empty: { gap: 10 },
  draftRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  draftDivider: { borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  draftText: { flex: 1, minWidth: 0, gap: 2 },
  day: { gap: 8 },
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 2 },
  gridRow: { flexDirection: 'row' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 4 },
  cell: { width: `${100 / 7}%`, alignItems: 'center', gap: 3, minHeight: 44 },
  dayNumber: { width: 28, height: 28, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  today: { backgroundColor: colors.actionPrimary },
  dots: { flexDirection: 'row', gap: 2, minHeight: 6 },
});
