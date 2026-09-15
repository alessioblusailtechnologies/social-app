import { useRouter } from 'expo-router';
import { ChevronLeft, Minus, Plus, X } from 'lucide-react-native';
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
  ProgressSegments,
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
import { CHANNELS } from '@/domain/catalog';
import { channelsWithIdea, rankIdeasForSlot, selectedChannels, type SlotDraft } from '@/domain/plan';
import { ChannelMark } from '@/features/brand-editors';
import { addDays, formatRange, formatWeekdayLong, startOfWeek, today } from '@/lib/dates';
import { useConfirmPlan, useIdeas, usePlan, useProposePlan } from '@/services/queries';

import { BalancePanel } from './PlanParts';

const STEPS = [
  {
    title: 'Periodo e ritmo',
    subtitle: 'Per quanto tempo pianifichiamo e con che ritmo. I valori partono dal tuo profilo.',
  },
  {
    title: 'Le uscite',
    subtitle: 'Giorni, orari e canali, con il tema che ogni uscita dovrebbe coprire. Togli quelle che non vuoi.',
  },
  {
    title: 'Le idee',
    subtitle: 'Per ogni uscita ho scelto un’idea salvata dello stesso tema. Cambiala se non ti convince.',
  },
  {
    title: 'Riepilogo',
    subtitle: 'Controlla l’equilibrio e conferma: le uscite finiscono nel piano.',
  },
];

type Weeks = '1' | '2' | '4';
type Start = 'tomorrow' | 'nextWeek';

export function PlanSessionScreen({ brand }: { brand: Brand }) {
  const router = useRouter();
  const toast = useToast();
  const { data: slots = [] } = usePlan(brand.id);
  const { data: ideas = [] } = useIdeas(brand.id);
  const propose = useProposePlan(brand.id);
  const confirm = useConfirmPlan(brand.id);
  const now = today();

  const [step, setStep] = useState(0);
  const [start, setStart] = useState<Start>('tomorrow');
  const [weeks, setWeeks] = useState<Weeks>('2');
  const [perWeek, setPerWeek] = useState(brand.positioning.postsPerWeek);
  const [channels, setChannels] = useState<ChannelId[]>(() => selectedChannels(brand));
  const [drafts, setDrafts] = useState<SlotDraft[]>([]);
  /** Il tema chiesto dallo scheletro, che resta il criterio anche quando cambi idea. */
  const [targets, setTargets] = useState<(string | null)[]>([]);

  const startDate = start === 'tomorrow' ? addDays(now, 1) : addDays(startOfWeek(now), 7);
  const endDate = addDays(startDate, Number(weeks) * 7 - 1);
  const withIdea = drafts.filter((draft) => draft.ideaId !== null).length;

  const close = () => (router.canGoBack() ? router.back() : router.replace('/plan'));
  const ideaOf = (draft: SlotDraft) => ideas.find((idea) => idea.id === draft.ideaId) ?? null;
  const themeOf = (themeId: string | null) => brand.themes.find((theme) => theme.id === themeId) ?? null;

  const runProposal = () =>
    propose.mutate(
      { startDate, weeks: Number(weeks), perWeek, channels },
      {
        onSuccess: (proposal) => {
          setDrafts(proposal);
          setTargets(proposal.map((draft) => draft.themeId));
          setStep(1);
        },
        onError: () => toast('Non riesco a preparare le uscite. Riprova.'),
      },
    );

  const removeDraft = (index: number) => {
    setDrafts(drafts.filter((_, i) => i !== index));
    setTargets(targets.filter((_, i) => i !== index));
  };

  const updateDraft = (index: number, patch: Partial<SlotDraft>) =>
    setDrafts(drafts.map((draft, i) => (i === index ? { ...draft, ...patch } : draft)));

  const changeIdea = (index: number) => {
    const draft = drafts[index];
    const used = new Set(
      [...slots.map((slot) => slot.ideaId), ...drafts.filter((_, i) => i !== index).map((other) => other.ideaId)].filter(
        (id): id is string => id !== null,
      ),
    );
    const options = rankIdeasForSlot({ ...draft, themeId: targets[index] }, ideas, used);
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
      themeId: next.themeId ?? targets[index],
      channels: channelsWithIdea({ ...draft, channels: [draft.channels[0]] }, next, channels),
    });
  };

  const clearIdea = (index: number) =>
    updateDraft(index, { ideaId: null, themeId: targets[index], channels: [drafts[index].channels[0]] });

  const toggleChannel = (channel: ChannelId) => {
    if (channels.includes(channel)) {
      if (channels.length === 1) {
        toast('Serve almeno un canale.');
        return;
      }
      setChannels(channels.filter((entry) => entry !== channel));
    } else {
      setChannels([...channels, channel]);
    }
  };

  const confirmPlan = () =>
    confirm.mutate(drafts, {
      onSuccess: (created) => {
        toast(`${created.length} ${created.length === 1 ? 'uscita aggiunta' : 'uscite aggiunte'} al piano.`);
        close();
      },
      onError: () => toast('Non sono riuscito a salvare il piano. Riprova.'),
    });

  const slotHeader = (draft: SlotDraft) => (
    <View style={styles.row}>
      <Text variant="strongSmall" style={styles.flex}>
        {formatWeekdayLong(draft.date)} · {draft.time}
      </Text>
      <View style={styles.marks}>
        {draft.channels.map((channel) => (
          <ChannelMark key={channel} channel={channel} active size={24} />
        ))}
      </View>
    </View>
  );

  const themeLine = (themeId: string | null) => {
    const theme = themeOf(themeId);
    return (
      <View style={styles.row}>
        {theme && <Dot color={theme.color} size={8} />}
        <Text variant="caption" numberOfLines={1} style={styles.flex}>
          {theme?.name ?? 'Senza tema'}
        </Text>
      </View>
    );
  };

  const footer = [
    <Button
      key="0"
      size="lg"
      block
      busy={propose.isPending}
      onPress={runProposal}>
      {propose.isPending ? 'Sto distribuendo le uscite…' : 'Proponi le uscite'}
    </Button>,
    <Button
      key="1"
      size="lg"
      block
      disabled={drafts.length === 0}
      onDisabledPress={() => toast('Non è rimasta nessuna uscita: torna indietro e cambia periodo.')}
      onPress={() => setStep(2)}>
      Continua
    </Button>,
    <Button key="2" size="lg" block onPress={() => setStep(3)}>
      Continua
    </Button>,
    <Button key="3" size="lg" block variant="accent" busy={confirm.isPending} onPress={confirmPlan}>
      {confirm.isPending ? 'Salvo il piano…' : 'Conferma il piano'}
    </Button>,
  ][step];

  return (
    <View style={screenStyles.screen}>
      <TopBar
        safeArea={Platform.OS !== 'ios'}
        left={
          step > 0 ? (
            <IconButton icon={ChevronLeft} accessibilityLabel="Passo precedente" onPress={() => setStep(step - 1)} />
          ) : undefined
        }
        title={`Pianifica · passo ${step + 1} di ${STEPS.length}`}
        right={<IconButton icon={X} accessibilityLabel="Chiudi" onPress={close} />}>
        <ProgressSegments count={STEPS.length} current={step} />
      </TopBar>

      <ScrollView contentContainerStyle={screenStyles.content}>
        <ScreenTitle title={STEPS[step].title} subtitle={STEPS[step].subtitle} />

        {step === 0 && propose.isPending && (
          <Panel gap={12} style={styles.bigPanel}>
            <Text variant="strongSmall">Sto distribuendo le uscite nei giorni migliori</Text>
            <SkeletonLines widths={[90, 72, 100, 64]} />
          </Panel>
        )}

        {step === 0 && !propose.isPending && (
          <>
            <Panel label="Quando" gap={10}>
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
              <Text variant="caption">{formatRange(startDate, endDate)}</Text>
            </Panel>

            <Panel label="Ritmo">
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
                  <Text variant="title" align="center">
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
            </Panel>

            <Panel label="Canali">
              <ChipGroup>
                {CHANNELS.filter(({ id }) => brand.channels[id].selected).map(({ id, name }) => (
                  <Chip key={id} label={name} selected={channels.includes(id)} onPress={() => toggleChannel(id)} />
                ))}
              </ChipGroup>
              <Text variant="caption">Ogni contenuto esce su un canale e, se il formato è adatto, anche sugli altri.</Text>
            </Panel>
          </>
        )}

        {step === 1 && (
          <>
            <BalancePanel themes={brand.themes} slots={drafts} label={`${drafts.length} uscite proposte`} />
            {drafts.length === 0 && (
              <Text variant="body">Tutti i giorni del periodo hanno già un’uscita. Torna indietro e scegli un altro periodo.</Text>
            )}
            {drafts.map((draft, index) => (
              <Panel key={`${draft.date}-${index}`} gap={8}>
                <View style={styles.row}>
                  <View style={styles.flex}>{slotHeader(draft)}</View>
                  <IconButton
                    icon={X}
                    variant="ghost"
                    size={32}
                    iconSize={16}
                    accessibilityLabel={`Togli l’uscita di ${formatWeekdayLong(draft.date)}`}
                    onPress={() => removeDraft(index)}
                  />
                </View>
                {themeLine(targets[index] ?? null)}
              </Panel>
            ))}
            <Text variant="caption" style={screenStyles.groupLabel}>
              Giorni e orari seguono le abitudini di ogni canale. I giorni che avevano già un’uscita li ho lasciati stare.
            </Text>
          </>
        )}

        {step === 2 && (
          <>
            <Text variant="caption" style={screenStyles.groupLabel}>
              {withIdea} uscite su {drafts.length} hanno un’idea. Le altre restano da riempire: potrai farlo dal piano.
            </Text>
            {drafts.map((draft, index) => {
              const idea = ideaOf(draft);
              const target = themeOf(targets[index] ?? null);
              return (
                <Panel key={`${draft.date}-${index}`} gap={10} style={!idea && styles.emptyPanel}>
                  {slotHeader(draft)}
                  {idea ? (
                    <>
                      <Text variant="strong">{idea.title}</Text>
                      {themeLine(draft.themeId)}
                      {draft.themeId !== targets[index] && target && (
                        <Badge tone="yellow" size="sm">{`Al posto di «${target.name}»`}</Badge>
                      )}
                    </>
                  ) : (
                    <Text variant="body">
                      {target ? `Nessuna idea salvata su «${target.name}».` : 'Nessuna idea salvata adatta.'}
                    </Text>
                  )}
                  <View style={styles.actions}>
                    <LinkButton label={idea ? 'Cambia idea' : 'Scegline una'} onPress={() => changeIdea(index)} />
                    {idea && <LinkButton label="Lascia da riempire" tone="muted" onPress={() => clearIdea(index)} />}
                  </View>
                </Panel>
              );
            })}
          </>
        )}

        {step === 3 && (
          <>
            <BalancePanel themes={brand.themes} slots={drafts} label="Equilibrio del periodo" />
            <Panel gap={0} style={styles.bigPanel}>
              {drafts.map((draft, index) => {
                const idea = ideaOf(draft);
                return (
                  <View key={`${draft.date}-${index}`} style={[styles.summaryRow, index > 0 && styles.divider]}>
                    <Dot color={themeOf(draft.themeId)?.color ?? colors.borderField} size={8} />
                    <View style={styles.flex}>
                      <Text variant="caption">
                        {formatWeekdayLong(draft.date)} · {draft.time}
                      </Text>
                      <Text variant="strongSmall" numberOfLines={2} color={idea ? colors.textTitle : colors.textBody}>
                        {idea?.title ?? 'Da riempire'}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </Panel>
            <Text variant="caption" style={screenStyles.groupLabel}>
              {drafts.length} uscite dal {formatRange(drafts[0]?.date ?? startDate, drafts[drafts.length - 1]?.date ?? endDate)} ·{' '}
              {withIdea} con un’idea · {drafts.length - withIdea} da riempire
            </Text>
          </>
        )}
      </ScrollView>

      <ScreenFooter>{footer}</ScreenFooter>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  marks: { flexDirection: 'row', gap: 4 },
  bigPanel: { borderRadius: radii.card },
  emptyPanel: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.borderField, backgroundColor: 'transparent' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepperValue: { flex: 1, alignItems: 'center', gap: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 18 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderTopColor: colors.borderSubtle },
});
