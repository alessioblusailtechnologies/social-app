import { useRouter } from 'expo-router';
import { Minus, Plus, X } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';

import {
  Badge,
  Button,
  Chip,
  ChipGroup,
  Dot,
  IconButton,
  LinkButton,
  Panel,
  ScreenFooter,
  ScreenTitle,
  SegmentedControl,
  SkeletonLines,
  Text,
  TopBar,
  colors,
  radii,
  screenStyles,
  useToast,
} from '@/design-system';
import type { Brand, ChannelId } from '@/domain/brand';
import { CHANNELS, channelName } from '@/domain/catalog';
import { channelsWithIdea, rankIdeasForSlot, selectedChannels, type SlotDraft } from '@/domain/plan';
import { ChannelMark } from '@/features/brand-editors';
import { addDays, formatRange, formatWeekdayLong, startOfWeek, today } from '@/lib/dates';
import { useConfirmPlan, useIdeas, usePlan, usePlanProposal } from '@/services/queries';

import { BalancePanel } from './PlanParts';

type Weeks = '1' | '2' | '4';
type Start = 'tomorrow' | 'nextWeek';

interface ProposalItem {
  draft: SlotDraft;
  /** Il tema chiesto dallo scheletro, che resta il criterio anche quando cambi idea. */
  target: string | null;
}

/** La pianificazione in una schermata: parte dai valori del profilo e mostra subito le uscite già riempite. */
export function PlanSessionScreen({ brand }: { brand: Brand }) {
  const router = useRouter();
  const toast = useToast();
  const { data: slots = [] } = usePlan(brand.id);
  const { data: ideas = [] } = useIdeas(brand.id);
  const confirm = useConfirmPlan(brand.id);
  const now = today();

  const [start, setStart] = useState<Start>('tomorrow');
  const [weeks, setWeeks] = useState<Weeks>('2');
  const [perWeek, setPerWeek] = useState(brand.positioning.postsPerWeek);
  const [channels, setChannels] = useState<ChannelId[]>(() => selectedChannels(brand));
  const [settingsOpen, setSettingsOpen] = useState(false);

  const startDate = start === 'tomorrow' ? addDays(now, 1) : addDays(startOfWeek(now), 7);
  const endDate = addDays(startDate, Number(weeks) * 7 - 1);
  const proposal = usePlanProposal(brand.id, { startDate, weeks: Number(weeks), perWeek, channels });

  // Le modifiche valgono per la proposta su cui sono state fatte: cambiando periodo, ritmo o canali si riparte da quella nuova.
  const [edited, setEdited] = useState<{ source: SlotDraft[]; items: ProposalItem[] } | null>(null);
  const items: ProposalItem[] = !proposal.data
    ? []
    : edited?.source === proposal.data
      ? edited.items
      : proposal.data.map((draft) => ({ draft, target: draft.themeId }));
  const setItems = (next: ProposalItem[]) => {
    if (proposal.data) setEdited({ source: proposal.data, items: next });
  };
  const drafts = items.map((item) => item.draft);
  const withIdea = drafts.filter((draft) => draft.ideaId !== null).length;

  const close = () => (router.canGoBack() ? router.back() : router.replace('/plan'));
  const ideaOf = (draft: SlotDraft) => ideas.find((idea) => idea.id === draft.ideaId) ?? null;
  const themeOf = (themeId: string | null) => brand.themes.find((theme) => theme.id === themeId) ?? null;

  const updateDraft = (index: number, patch: Partial<SlotDraft>) =>
    setItems(items.map((item, i) => (i === index ? { ...item, draft: { ...item.draft, ...patch } } : item)));

  const removeDraft = (index: number) => setItems(items.filter((_, i) => i !== index));

  const changeIdea = (index: number) => {
    const { draft, target } = items[index];
    const used = new Set(
      [...slots.map((slot) => slot.ideaId), ...drafts.filter((_, i) => i !== index).map((other) => other.ideaId)].filter(
        (id): id is string => id !== null,
      ),
    );
    const options = rankIdeasForSlot({ ...draft, themeId: target }, ideas, used);
    if (options.length === 0) {
      toast('Non ci sono altre idee salvate libere: salvane qualcuna dalle Idee.');
      return;
    }
    const next = options[(options.findIndex((idea) => idea.id === draft.ideaId) + 1) % options.length];
    if (next.id === draft.ideaId) {
      toast('È l’unica idea salvata adatta a questa uscita.');
      return;
    }
    updateDraft(index, {
      ideaId: next.id,
      themeId: next.themeId ?? target,
      channels: channelsWithIdea({ ...draft, channels: [draft.channels[0]] }, next, channels),
    });
  };

  const clearIdea = (index: number) => {
    const { draft, target } = items[index];
    updateDraft(index, { ideaId: null, themeId: target, channels: [draft.channels[0]] });
  };

  const toggleChannel = (channel: ChannelId) => {
    if (!channels.includes(channel)) {
      setChannels([...channels, channel]);
      return;
    }
    if (channels.length === 1) {
      toast('Serve almeno un canale.');
      return;
    }
    setChannels(channels.filter((entry) => entry !== channel));
  };

  const confirmPlan = () =>
    confirm.mutate(drafts, {
      onSuccess: (created) => {
        toast(`${created.length} ${created.length === 1 ? 'uscita aggiunta' : 'uscite aggiunte'} al piano.`);
        close();
      },
      onError: () => toast('Non sono riuscito a salvare il piano. Riprova.'),
    });

  return (
    <View style={screenStyles.screen}>
      <TopBar
        safeArea={Platform.OS !== 'ios'}
        title="Pianifica"
        right={<IconButton icon={X} accessibilityLabel="Chiudi" onPress={close} />}
      />

      <ScrollView contentContainerStyle={screenStyles.content}>
        <ScreenTitle
          title="Le prossime settimane"
          subtitle="Distribuisco le uscite nei giorni migliori e le riempio con le tue idee salvate, rispettando i pesi dei temi."
        />

        <Panel gap={10}>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Text variant="strongSmall">{formatRange(startDate, endDate)}</Text>
              <Text variant="caption" numberOfLines={2}>
                {perWeek} a settimana · {channels.map(channelName).join(' · ')}
              </Text>
            </View>
            <LinkButton label={settingsOpen ? 'Fatto' : 'Modifica'} onPress={() => setSettingsOpen(!settingsOpen)} />
          </View>

          {settingsOpen && (
            <>
              <View style={styles.section}>
                <Text variant="label">Quando</Text>
                <SegmentedControl
                  accessibilityLabel="Inizio"
                  value={start}
                  onChange={setStart}
                  options={[
                    { value: 'tomorrow', label: 'Da domani' },
                    { value: 'nextWeek', label: 'Dalla prossima settimana' },
                  ]}
                />
                <SegmentedControl
                  accessibilityLabel="Durata"
                  value={weeks}
                  onChange={setWeeks}
                  options={[
                    { value: '1', label: '1 settimana' },
                    { value: '2', label: '2 settimane' },
                    { value: '4', label: '4 settimane' },
                  ]}
                />
              </View>

              <View style={styles.section}>
                <Text variant="label">Ritmo</Text>
                <View style={styles.stepper}>
                  <IconButton
                    icon={Minus}
                    variant="outline"
                    size={44}
                    accessibilityLabel="Meno contenuti"
                    disabled={perWeek <= 1}
                    onPress={() => setPerWeek(Math.max(1, perWeek - 1))}
                  />
                  <View style={styles.stepperValue}>
                    <Text variant="heading" align="center">
                      {perWeek} a settimana
                    </Text>
                    <Text variant="caption" align="center">
                      {perWeek * Number(weeks)} contenuti in tutto · dal profilo: {brand.positioning.postsPerWeek}
                    </Text>
                  </View>
                  <IconButton
                    icon={Plus}
                    variant="outline"
                    size={44}
                    accessibilityLabel="Più contenuti"
                    disabled={perWeek >= 7}
                    onPress={() => setPerWeek(Math.min(7, perWeek + 1))}
                  />
                </View>
              </View>

              <View style={styles.section}>
                <Text variant="label">Canali</Text>
                <ChipGroup>
                  {CHANNELS.filter(({ id }) => brand.channels[id].selected).map(({ id, name }) => (
                    <Chip key={id} size="sm" label={name} selected={channels.includes(id)} onPress={() => toggleChannel(id)} />
                  ))}
                </ChipGroup>
                <Text variant="caption">
                  Ogni contenuto esce su un canale e, se il formato è adatto, anche sugli altri. Cambiando queste scelte rifaccio
                  la proposta.
                </Text>
              </View>
            </>
          )}
        </Panel>

        {proposal.isPending ? (
          <Panel gap={12} style={styles.bigPanel}>
            <Text variant="strongSmall">Sto distribuendo le uscite nei giorni migliori</Text>
            <SkeletonLines widths={[90, 72, 100, 64]} />
          </Panel>
        ) : proposal.isError ? (
          <Panel gap={10}>
            <Text variant="body" color={colors.textTitle}>
              Non riesco a preparare le uscite.
            </Text>
            <Button variant="secondary" onPress={() => proposal.refetch()}>
              Riprova
            </Button>
          </Panel>
        ) : (
          <>
            <BalancePanel
              themes={brand.themes}
              slots={drafts}
              label={`${drafts.length} uscite · ${withIdea} con un’idea`}
            />

            {items.length === 0 && (
              <Text variant="body" style={screenStyles.groupLabel}>
                Tutti i giorni del periodo hanno già un’uscita. Scegli un altro periodo.
              </Text>
            )}

            {items.map(({ draft, target }, index) => {
              const idea = ideaOf(draft);
              const theme = themeOf(draft.themeId);
              const targetTheme = themeOf(target);
              return (
                <Panel key={`${draft.date}-${index}`} gap={8} style={!idea && styles.emptyPanel}>
                  <View style={styles.row}>
                    <Text variant="strongSmall" style={styles.flex}>
                      {formatWeekdayLong(draft.date)} · {draft.time}
                    </Text>
                    <View style={styles.marks}>
                      {draft.channels.map((channel) => (
                        <ChannelMark key={channel} channel={channel} active size={24} />
                      ))}
                    </View>
                    <IconButton
                      icon={X}
                      variant="ghost"
                      size={32}
                      iconSize={16}
                      accessibilityLabel={`Togli l’uscita di ${formatWeekdayLong(draft.date)}`}
                      onPress={() => removeDraft(index)}
                    />
                  </View>
                  {idea ? (
                    <Text variant="strong">{idea.title}</Text>
                  ) : (
                    <Text variant="body">
                      {targetTheme ? `Nessuna idea salvata su «${targetTheme.name}».` : 'Nessuna idea salvata adatta.'}
                    </Text>
                  )}
                  <View style={styles.row}>
                    {theme && <Dot color={theme.color} size={8} />}
                    <Text variant="caption" numberOfLines={1} style={styles.flex}>
                      {theme?.name ?? 'Senza tema'}
                    </Text>
                    {draft.themeId !== target && targetTheme && (
                      <Badge tone="yellow" size="sm">{`Al posto di «${targetTheme.name}»`}</Badge>
                    )}
                  </View>
                  <View style={styles.actions}>
                    <LinkButton label={idea ? 'Cambia idea' : 'Scegline una'} onPress={() => changeIdea(index)} />
                    {idea && <LinkButton label="Lascia da riempire" tone="muted" onPress={() => clearIdea(index)} />}
                  </View>
                </Panel>
              );
            })}

            {items.length > 0 && (
              <Text variant="caption" style={screenStyles.groupLabel}>
                Giorni e orari seguono le abitudini di ogni canale; i giorni che avevano già un’uscita li ho lasciati stare. Le
                uscite senza idea restano da riempire dal piano.
              </Text>
            )}
          </>
        )}
      </ScrollView>

      <ScreenFooter>
        <Button
          size="lg"
          block
          variant="accent"
          disabled={items.length === 0}
          busy={confirm.isPending}
          onDisabledPress={() =>
            toast(proposal.isPending ? 'Aspetta che le uscite siano pronte.' : 'Non c’è nessuna uscita da aggiungere.')
          }
          onPress={confirmPlan}>
          {confirm.isPending
            ? 'Salvo il piano…'
            : items.length > 0
              ? `Aggiungi ${items.length} ${items.length === 1 ? 'uscita' : 'uscite'} al piano`
              : 'Aggiungi al piano'}
        </Button>
      </ScreenFooter>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  marks: { flexDirection: 'row', gap: 4 },
  section: { gap: 10, borderTopWidth: 1, borderTopColor: colors.borderSubtle, paddingTop: 12 },
  bigPanel: { borderRadius: radii.card },
  emptyPanel: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.borderField, backgroundColor: 'transparent' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepperValue: { flex: 1, alignItems: 'center', gap: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 18 },
});
