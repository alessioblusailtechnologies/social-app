import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import {
  Badge,
  Button,
  Chip,
  ChipGroup,
  IconButton,
  LinkButton,
  Panel,
  ScreenFooter,
  SegmentedControl,
  SkeletonLines,
  SunkenInput,
  Text,
  TopBar,
  colors,
  screenStyles,
  useToast,
} from '@/design-system';
import { currentVoiceCard, isConnected, type Brand, type ChannelId } from '@/domain/brand';
import { channelName } from '@/domain/catalog';
import { CHANNEL_LIMITS, checkVoice, REWRITE_INSTRUCTIONS, type Content } from '@/domain/content';
import { FORMAT_LABELS, type IdeaFormat, type IdeaSource } from '@/domain/idea';
import { BEST_TIMES, nextFreeDay, SLOT_STATUS_LABELS, type PlanSlot } from '@/domain/plan';
import { ChannelMark } from '@/features/brand-editors';
import { SLOT_TONES } from '@/features/plan/PlanParts';
import { addDays, formatWeekdayLong, formatWeekdayShort, today } from '@/lib/dates';
import {
  useApproveContent,
  useEditVariant,
  useIdeas,
  usePlan,
  usePrepareContent,
  useRegenerateContent,
  useReopenContent,
  useRewriteVariant,
  useScheduleContent,
} from '@/services/queries';

import { PostPreview, ScenesPanel, VoicePanel } from './ContentParts';

const FORMATS = Object.keys(FORMAT_LABELS) as IdeaFormat[];
const TIMES = ['08:30', '12:30', '13:00', '18:30', '19:00'];

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function describeBrief(brief: IdeaSource): string {
  if (brief.kind === 'prompt') return brief.text;
  if (brief.kind === 'link') return brief.note ? `${brief.url} · ${brief.note}` : brief.url;
  return brief.note ? `${brief.name} · ${brief.note}` : brief.name;
}

function nowTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

export interface ContentScreenProps {
  brand: Brand;
  /** L'uscita del piano; nulla per un contenuto creato direttamente e non ancora programmato. */
  slot: PlanSlot | null;
  content: Content | null;
  loading: boolean;
}

export function ContentScreen({ brand, slot, content, loading }: ContentScreenProps) {
  const router = useRouter();
  const toast = useToast();
  const { data: ideas = [] } = useIdeas(brand.id);
  const { data: planSlots = [] } = usePlan(brand.id);
  const prepare = usePrepareContent(brand.id);
  const regenerate = useRegenerateContent();
  const approve = useApproveContent(brand.id);
  const schedule = useScheduleContent(brand.id);
  const reopen = useReopenContent(brand.id);
  const editVariant = useEditVariant();
  const rewrite = useRewriteVariant();

  const [selectedChannel, setSelectedChannel] = useState<ChannelId | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [when, setWhen] = useState<{ date: string; time: string } | null>(null);

  const ideaId = content?.ideaId ?? slot?.ideaId ?? null;
  const idea = ideas.find((candidate) => candidate.id === ideaId) ?? null;
  const direct = content !== null && content.ideaId === null;
  const channels = slot?.channels ?? content?.channels ?? [];
  const channel = selectedChannel ?? channels[0];
  const variant = content?.variants.find((candidate) => candidate.channel === channel) ?? content?.variants[0] ?? null;
  const format: IdeaFormat = content?.format ?? idea?.formats[0] ?? 'post';
  const formatOptions = direct ? FORMATS : (idea?.formats ?? []);
  const published = slot?.status === 'published';
  const approved = content?.status === 'approved';
  const locked = approved || published;
  const busy = prepare.isPending || regenerate.isPending;
  const unconnected = channels.filter((candidate) => !isConnected(brand.channels[candidate]));
  const missing = content ? channels.filter((candidate) => !content.variants.some((v) => v.channel === candidate)) : [];
  const text = editing ? draftText : (variant?.text ?? '');
  const check = checkVoice(text, currentVoiceCard(brand.voice), variant ? CHANNEL_LIMITS[variant.channel] : undefined);
  const channelNames = channels.map(channelName).join(' e ');
  const slotWhen = slot ? `${formatWeekdayShort(slot.date)} alle ${slot.time}` : '';

  const close = () => (router.canGoBack() ? router.back() : router.replace('/plan'));

  const redo = (nextFormat?: IdeaFormat) => {
    const options = {
      onSuccess: () => {
        setEditing(false);
        toast(direct ? 'Bozza rifatta con un altro taglio.' : 'Bozza rifatta.');
      },
      onError: () => toast('Non riesco a preparare la bozza. Riprova.'),
    };
    if (direct && content) regenerate.mutate({ contentId: content.id, format: nextFormat }, options);
    else if (slot) prepare.mutate({ slotId: slot.id, format: nextFormat }, options);
  };

  const saveEdit = () => {
    if (!content || !variant) return;
    editVariant.mutate(
      { contentId: content.id, channel: variant.channel, text: draftText.trim() },
      {
        onSuccess: () => {
          setEditing(false);
          toast('Testo aggiornato.');
        },
        onError: () => toast('Modifica non salvata. Riprova.'),
      },
    );
  };

  const manualReminder =
    unconnected.length > 0
      ? ` ${unconnected.map(channelName).join(' e ')} non è collegato: all’orario ti ricordo di pubblicarla a mano.`
      : '';

  const approveInSlot = () => {
    if (!content) return;
    approve.mutate(content.id, {
      onSuccess: () => {
        toast(`Programmata per ${slotWhen}.${manualReminder}`);
        close();
      },
      onError: () => toast('Approvazione non riuscita. Riprova.'),
    });
  };

  const openScheduling = () => setWhen(nextFreeDay(planSlots, channels[0], today()));

  const confirmSchedule = (publishNow: boolean) => {
    if (!content) return;
    const target = publishNow ? { date: today(), time: nowTime() } : when;
    if (!target) return;
    schedule.mutate(
      { contentId: content.id, ...target, publishNow },
      {
        onSuccess: () => {
          toast(
            publishNow
              ? `Pubblicata su ${channelNames}.`
              : `Programmata per ${formatWeekdayShort(target.date)} alle ${target.time}.${manualReminder}`,
          );
          router.dismissTo('/plan');
        },
        onError: () => toast('Non riesco a programmarla. Riprova.'),
      },
    );
  };

  const days = Array.from({ length: 14 }, (_, i) => addDays(today(), i + 1));
  const times = [...new Set([when?.time ?? '', channels[0] ? BEST_TIMES[channels[0]].time : '', ...TIMES])]
    .filter(Boolean)
    .sort();

  return (
    <KeyboardAvoidingView style={screenStyles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <TopBar
        left={<IconButton icon={ChevronLeft} accessibilityLabel="Indietro" onPress={close} />}
        title="Contenuto"
        right={
          slot ? (
            <Badge tone={SLOT_TONES[slot.status]} size="sm">
              {SLOT_STATUS_LABELS[slot.status]}
            </Badge>
          ) : (
            <Badge tone="neutral" size="sm">
              Bozza
            </Badge>
          )
        }
      />

      <ScrollView contentContainerStyle={screenStyles.content} keyboardShouldPersistTaps="handled">
        <Panel gap={10}>
          <View style={styles.row}>
            <Text variant="strongSmall" style={styles.flex}>
              {slot ? `${capitalize(formatWeekdayLong(slot.date))} · ${slot.time}` : 'Non ancora programmato'}
            </Text>
            <View style={styles.marks}>
              {channels.map((candidate) => (
                <ChannelMark key={candidate} channel={candidate} active size={24} />
              ))}
            </View>
          </View>
          {idea && (
            <View style={styles.origin}>
              <Text variant="label">Dall’idea</Text>
              <Text variant="strong">{idea.title}</Text>
              <LinkButton
                label="Apri l’idea"
                onPress={() => router.push({ pathname: '/idea/[id]', params: { id: idea.id } })}
              />
            </View>
          )}
          {!idea && content?.brief && (
            <View style={styles.origin}>
              <Text variant="label">Dalla tua richiesta</Text>
              <Text variant="body" color={colors.textTitle} numberOfLines={4}>
                {describeBrief(content.brief)}
              </Text>
            </View>
          )}
          {!idea && !content && !loading && (
            <Text variant="body">Questa uscita non ha ancora un’idea: sceglila dal piano.</Text>
          )}
        </Panel>

        {(loading || busy) && (
          <Panel gap={12}>
            <Text variant="strongSmall">{busy ? `Sto scrivendo per ${channelNames}` : 'Carico la bozza'}</Text>
            <SkeletonLines widths={[96, 88, 100, 72, 60]} />
          </Panel>
        )}

        {!loading && !busy && !content && idea && (
          <Panel label="Da preparare" gap={10}>
            <Text variant="body" color={colors.textTitle}>
              Scrivo il testo per {channelNames} seguendo la tua scheda voce e preparo il visivo del formato.
            </Text>
            {idea.formats.length > 1 && <Text variant="caption">Formato: {FORMAT_LABELS[format]}. Potrai cambiarlo dopo.</Text>}
          </Panel>
        )}

        {content && variant && !busy && (
          <>
            {channels.length > 1 && (
              <SegmentedControl
                accessibilityLabel="Canale"
                value={channel}
                onChange={(next) => {
                  setEditing(false);
                  setSelectedChannel(next);
                }}
                options={channels.map((candidate) => ({ value: candidate, label: channelName(candidate) }))}
              />
            )}

            {missing.length > 0 && !locked && (
              <Panel gap={6}>
                <Text variant="caption" color={colors.textTitle}>
                  La bozza non include {missing.map(channelName).join(' e ')}: rifalla per aggiungerli.
                </Text>
                <LinkButton label="Rifai la bozza" onPress={() => redo()} />
              </Panel>
            )}

            {editing ? (
              <Panel label={`Testo per ${channelName(variant.channel)}`} gap={10}>
                <SunkenInput
                  multiline
                  minHeight={220}
                  value={draftText}
                  onChangeText={setDraftText}
                  autoFocus
                  accessibilityLabel={`Testo per ${channelName(variant.channel)}`}
                />
                <Text
                  variant="caption"
                  color={draftText.length > CHANNEL_LIMITS[variant.channel] ? colors.warning : colors.textBody}>
                  {draftText.length}/{CHANNEL_LIMITS[variant.channel]} caratteri
                </Text>
                <View style={styles.actions}>
                  <Button size="sm" variant="ghost" onPress={() => setEditing(false)}>
                    Annulla
                  </Button>
                  <Button size="sm" busy={editVariant.isPending} disabled={!draftText.trim()} onPress={saveEdit}>
                    Salva il testo
                  </Button>
                </View>
              </Panel>
            ) : (
              <PostPreview
                brand={brand}
                variant={variant}
                format={content.format}
                visual={content.visual}
                when={slot ? slotWhen : 'bozza'}
              />
            )}

            {!locked && !editing && (
              <Panel label="Ritocca" gap={10}>
                <ChipGroup>
                  {REWRITE_INSTRUCTIONS.map((instruction) => (
                    <Chip
                      key={instruction}
                      size="sm"
                      label={instruction}
                      onPress={() =>
                        !rewrite.isPending &&
                        rewrite.mutate(
                          { contentId: content.id, channel: variant.channel, instruction },
                          {
                            onSuccess: () => toast(`Riscritto: ${instruction.toLowerCase()}.`),
                            onError: () => toast('Riscrittura non riuscita. Riprova.'),
                          },
                        )
                      }
                    />
                  ))}
                </ChipGroup>
                <View style={styles.links}>
                  <LinkButton
                    label="Modifica il testo a mano"
                    onPress={() => {
                      setDraftText(variant.text);
                      setEditing(true);
                    }}
                  />
                  {rewrite.isPending && <Text variant="caption">Riscrivo…</Text>}
                </View>
              </Panel>
            )}

            <VoicePanel check={check} />

            {content.format === 'video' && <ScenesPanel scenes={content.visual.scenes} />}

            {!locked && formatOptions.length > 1 && (
              <Panel label="Formato" gap={8}>
                <ChipGroup>
                  {formatOptions.map((candidate) => (
                    <Chip
                      key={candidate}
                      size="sm"
                      label={FORMAT_LABELS[candidate]}
                      selected={candidate === content.format}
                      onPress={() => candidate !== content.format && redo(candidate)}
                    />
                  ))}
                </ChipGroup>
                <Text variant="caption">Cambiare formato rifà la bozza.</Text>
              </Panel>
            )}

            {when && !content.slotId && !locked && (
              <Panel label="Quando esce" gap={10}>
                <ChipGroup>
                  {days.map((day) => (
                    <Chip
                      key={day}
                      size="sm"
                      label={formatWeekdayShort(day)}
                      selected={day === when.date}
                      onPress={() => setWhen({ ...when, date: day })}
                    />
                  ))}
                </ChipGroup>
                <ChipGroup>
                  {times.map((time) => (
                    <Chip key={time} size="sm" label={time} selected={time === when.time} onPress={() => setWhen({ ...when, time })} />
                  ))}
                </ChipGroup>
                <Text variant="caption">
                  Ti propongo il primo giorno libero adatto a {channelName(channels[0])}. Entra nel piano come le altre uscite.
                </Text>
              </Panel>
            )}

            {locked && slot && (
              <Panel label={published ? 'Pubblicata' : 'Programmata'} gap={6}>
                <Text variant="body" color={colors.textTitle}>
                  {published ? `Uscita ${slotWhen} su ${channelNames}.` : `Esce ${slotWhen} su ${channelNames}.`}
                </Text>
                {!published && manualReminder ? <Text variant="caption">{manualReminder.trim()}</Text> : null}
              </Panel>
            )}
          </>
        )}
      </ScrollView>

      {!published && !loading && (idea || content) && (
        <ScreenFooter>
          {!content && (
            <Button size="lg" block busy={prepare.isPending} onPress={() => redo()}>
              {prepare.isPending ? 'Sto preparando la bozza…' : 'Prepara la bozza'}
            </Button>
          )}

          {content && !approved && content.slotId && (
            <>
              <Button
                size="lg"
                block
                variant="accent"
                disabled={editing || busy}
                busy={approve.isPending}
                onDisabledPress={() => toast(editing ? 'Salva prima il testo.' : 'Aspetta che la bozza sia pronta.')}
                onPress={approveInSlot}>
                {approve.isPending ? 'Programmo…' : 'Approva e programma'}
              </Button>
              <Button variant="ghost" block busy={busy} onPress={() => redo()}>
                Rifai la bozza
              </Button>
            </>
          )}

          {content && !approved && !content.slotId && !when && (
            <>
              <Button
                size="lg"
                block
                variant="accent"
                disabled={editing || busy}
                onDisabledPress={() => toast(editing ? 'Salva prima il testo.' : 'Aspetta che la bozza sia pronta.')}
                onPress={openScheduling}>
                Approva e scegli quando
              </Button>
              <Button variant="ghost" block busy={busy} onPress={() => redo()}>
                Rifai la bozza
              </Button>
            </>
          )}

          {content && !approved && !content.slotId && when && (
            <>
              <Button size="lg" block variant="accent" busy={schedule.isPending} onPress={() => confirmSchedule(false)}>
                {schedule.isPending ? 'Programmo…' : `Programma per ${formatWeekdayShort(when.date)} alle ${when.time}`}
              </Button>
              <View style={styles.actions}>
                <Button variant="ghost" onPress={() => setWhen(null)}>
                  Annulla
                </Button>
                <Button variant="secondary" busy={schedule.isPending} onPress={() => confirmSchedule(true)}>
                  Pubblica adesso
                </Button>
              </View>
            </>
          )}

          {content && approved && (
            <Button
              size="lg"
              block
              variant="secondary"
              busy={reopen.isPending}
              onPress={() =>
                reopen.mutate(content.id, {
                  onSuccess: () => toast('Di nuovo in bozza: approvala quando è pronta.'),
                  onError: () => toast('Non riesco a riaprire la bozza. Riprova.'),
                })
              }>
              Riapri la bozza
            </Button>
          )}
        </ScreenFooter>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  marks: { flexDirection: 'row', gap: 4 },
  origin: { gap: 4, borderTopWidth: 1, borderTopColor: colors.borderSubtle, paddingTop: 10 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  links: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 18 },
});
