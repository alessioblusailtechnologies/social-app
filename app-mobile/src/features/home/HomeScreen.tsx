import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  Badge,
  Button,
  Card,
  LinkButton,
  Panel,
  ScreenTitle,
  SkeletonLines,
  Text,
  TopBar,
  colors,
  palette,
  screenStyles,
  type BadgeTone,
} from '@/design-system';
import type { Brand } from '@shared/domain/brand';
import { channelName } from '@shared/domain/catalog';
import { HOME_HORIZON_DAYS, homeSummary, homeTasks, type HomeTask, type HomeTaskKind } from '@shared/domain/home';
import { FORMAT_LABELS } from '@shared/domain/idea';
import type { PlanSlot } from '@shared/domain/plan';
import { completeness } from '@shared/domain/sections';
import { BrandAvatar } from '@/features/brand-editors';
import { BalancePanel, SlotCard } from '@/features/plan/PlanParts';
import { addDays, formatWeekdayLong, formatWeekdayShort, startOfWeek, today } from '@shared/lib/dates';
import { useContents, useIdeas, usePlan } from '@/services/queries';

const TASK_BADGES: Record<HomeTaskKind, { label: string; tone: BadgeTone }> = {
  approve: { label: 'Da approvare', tone: 'coral' },
  prepare: { label: 'Da preparare', tone: 'yellow' },
  fill: { label: 'Da riempire', tone: 'neutral' },
  shoot: { label: 'Da girare', tone: 'yellow' },
  schedule: { label: 'Da programmare', tone: 'neutral' },
};

const VISIBLE_TASKS = 5;
const VISIBLE_QUEUE = 3;

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function dayLabel(day: string, now: string): string {
  if (day === now) return 'Oggi';
  if (day === addDays(now, 1)) return 'Domani';
  return capitalize(formatWeekdayShort(day));
}

/** La giornata: cosa tocca a te, cosa esce da solo e com'è messa la settimana. */
export function HomeScreen({ brand }: { brand: Brand }) {
  const router = useRouter();
  const now = today();
  const planQuery = usePlan(brand.id);
  const contentsQuery = useContents(brand.id);
  const { data: ideas = [] } = useIdeas(brand.id);

  const slots = planQuery.data ?? [];
  const contents = contentsQuery.data ?? [];
  const loading = planQuery.isPending || contentsQuery.isPending;
  const firstRun = !loading && slots.length === 0 && contents.length === 0;

  const ideaOf = (slot: PlanSlot) => ideas.find((idea) => idea.id === slot.ideaId) ?? null;
  const themeOf = (themeId: string | null) => brand.themes.find((theme) => theme.id === themeId) ?? null;
  const openSlot = (slot: PlanSlot) => router.push({ pathname: '/content/[slotId]', params: { slotId: slot.id } });

  const tasks = homeTasks(slots, contents, now);
  const queue = slots.filter((slot) => slot.status === 'scheduled' || (slot.status === 'published' && slot.date === now));

  const weekStart = startOfWeek(now);
  const weekEnd = addDays(weekStart, 6);
  const weekSlots = slots.filter((slot) => slot.date >= weekStart && slot.date <= weekEnd);
  const filled = weekSlots.filter((slot) => slot.ideaId !== null || Boolean(slot.contentTitle)).length;
  const target = Math.max(brand.positioning.postsPerWeek, weekSlots.length);

  const proposals = ideas.filter((idea) => idea.status === 'new').length;
  const planned = new Set(slots.map((slot) => slot.ideaId));
  const freeSaved = ideas.filter((idea) => idea.status === 'saved' && !planned.has(idea.id)).length;
  const toFill = tasks.filter((task) => task.kind === 'fill' && !task.late).length;
  const { percent } = completeness(brand);

  const openTask = (task: HomeTask) => {
    // Chi deve girare va dritto al Video Studio, dove si caricano i girati.
    if (task.slot && task.kind === 'shoot') {
      router.push({ pathname: '/content/[slotId]', params: { slotId: task.slot.id, step: 'visual' } });
    } else if (task.slot) openSlot(task.slot);
    else if (task.content) router.push({ pathname: '/draft/[contentId]', params: { contentId: task.content.id } });
  };

  const describe = (task: HomeTask): { title: string; detail: string } => {
    const { slot, content } = task;
    if (!slot) {
      const channels = (content?.channels ?? []).map(channelName).join(' · ');
      return {
        title: content?.title ?? '',
        detail: `Senza data · ${channels}${content ? ` · ${FORMAT_LABELS[content.format]}` : ''}`,
      };
    }
    const theme = themeOf(slot.themeId);
    const title =
      ideaOf(slot)?.title ??
      slot.contentTitle ??
      content?.title ??
      (theme ? `Serve un contenuto su «${theme.name}»` : 'Serve un contenuto');
    const when = task.late ? `Era per ${formatWeekdayShort(slot.date)}` : `${dayLabel(slot.date, now)} alle ${slot.time}`;
    const shoot =
      task.scenesToShoot > 0 ? ` · ${task.scenesToShoot} ${task.scenesToShoot === 1 ? 'scena' : 'scene'} da girare` : '';
    return { title, detail: `${when} · ${slot.channels.map(channelName).join(' · ')}${shoot}` };
  };

  return (
    <View style={screenStyles.screen}>
      <TopBar
        left={
          <View style={styles.brand}>
            <BrandAvatar brand={brand} size={32} />
            <Text variant="strong" numberOfLines={1} style={styles.brandName}>
              {brand.identity.name}
            </Text>
          </View>
        }
      />

      <ScrollView contentContainerStyle={screenStyles.content}>
        <ScreenTitle
          title={capitalize(formatWeekdayLong(now))}
          subtitle={loading || firstRun ? undefined : homeSummary(slots, now)}
        />

        {loading ? (
          <Panel gap={12}>
            <SkeletonLines widths={[80, 100, 64]} />
          </Panel>
        ) : firstRun ? (
          <Card>
            <View style={styles.stack}>
              <Badge tone="navy" size="sm">
                Parti da qui
              </Badge>
              <Text variant="heading">Il piano è ancora vuoto</Text>
              <Text variant="body">
                Guarda le idee che ho preparato dal tuo Brand DNA e tieni quelle che ti convincono. Poi pianifica le
                prossime settimane: le uscite si riempiono con le idee salvate.
              </Text>
              <Button block onPress={() => router.navigate('/ideas')}>
                Guarda le idee
              </Button>
              <Button block variant="secondary" onPress={() => router.push('/plan-session')}>
                Pianifica
              </Button>
              <Button block variant="ghost" onPress={() => router.push('/new-content')}>
                Scrivi un contenuto
              </Button>
            </View>
          </Card>
        ) : (
          <>
            <Panel
              label="Da fare"
              action={tasks.length > 0 ? <Text variant="value">{tasks.length}</Text> : undefined}
              gap={0}>
              {tasks.length === 0 ? (
                <Text variant="body" style={styles.nothing}>
                  Niente in sospeso nei prossimi {HOME_HORIZON_DAYS} giorni.
                </Text>
              ) : (
                tasks.slice(0, VISIBLE_TASKS).map((task, i) => {
                  const { title, detail } = describe(task);
                  const badge = TASK_BADGES[task.kind];
                  return (
                    <Pressable
                      key={`${task.kind}-${task.slot?.id ?? task.content?.id}`}
                      accessibilityRole="button"
                      accessibilityLabel={`${badge.label}: ${title}. ${detail}`}
                      onPress={() => openTask(task)}
                      style={[styles.task, i > 0 && styles.divider]}>
                      <View style={styles.taskText}>
                        <Badge tone={badge.tone} size="sm">
                          {badge.label}
                        </Badge>
                        <Text variant="strongSmall" numberOfLines={2}>
                          {title}
                        </Text>
                        <Text variant="caption" color={task.late ? colors.warning : undefined} numberOfLines={2}>
                          {detail}
                        </Text>
                      </View>
                      <ChevronRight size={16} color={palette.grey300} />
                    </Pressable>
                  );
                })
              )}
              {tasks.length > VISIBLE_TASKS && (
                <View style={styles.divider}>
                  <LinkButton
                    label={`Altre ${tasks.length - VISIBLE_TASKS} nel piano`}
                    onPress={() => router.navigate('/plan')}
                  />
                </View>
              )}
            </Panel>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text variant="label" style={styles.flex}>
                  In coda
                </Text>
                <LinkButton label="Apri il piano" onPress={() => router.navigate('/plan')} />
              </View>
              {queue.length === 0 ? (
                <Panel>
                  <Text variant="body">
                    Nessun contenuto programmato. Quando approvi una bozza finisce qui ed esce da sola all’orario.
                  </Text>
                </Panel>
              ) : (
                queue
                  .slice(0, VISIBLE_QUEUE)
                  .map((slot) => (
                    <SlotCard
                      key={slot.id}
                      slot={slot}
                      idea={ideaOf(slot)}
                      theme={themeOf(slot.themeId)}
                      when={`${dayLabel(slot.date, now)} · ${slot.time}`}
                      onPress={() => openSlot(slot)}
                    />
                  ))
              )}
            </View>

            <BalancePanel
              themes={brand.themes}
              slots={weekSlots}
              label={`Questa settimana · ${filled} di ${target} uscite`}
            />

            <Panel label="Idee" action={<LinkButton label="Apri" onPress={() => router.navigate('/ideas')} />} gap={6}>
              <Text variant="body" color={colors.textTitle}>
                {proposals === 1 ? '1 proposta da guardare' : `${proposals} proposte da guardare`} ·{' '}
                {freeSaved === 1 ? '1 salvata non ancora nel piano' : `${freeSaved} salvate non ancora nel piano`}
              </Text>
              {toFill > freeSaved && (
                <Text variant="caption" color={colors.warning}>
                  Nei prossimi giorni ci sono {toFill} uscite da riempire: salva qualche idea in più.
                </Text>
              )}
            </Panel>

            {percent < 100 && (
              <Panel label="Brand DNA" action={<Text variant="value">{percent}%</Text>} gap={6}>
                <Text variant="body">Più il profilo è preciso, meno correzioni farai alle bozze.</Text>
                <LinkButton label="Completa il profilo" onPress={() => router.navigate('/profile')} />
              </Panel>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  brandName: { flexShrink: 1 },
  stack: { gap: 10, alignItems: 'stretch' },
  nothing: { paddingTop: 8 },
  task: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  taskText: { flex: 1, minWidth: 0, gap: 4, alignItems: 'flex-start' },
  divider: { borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  section: { gap: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 2 },
});
