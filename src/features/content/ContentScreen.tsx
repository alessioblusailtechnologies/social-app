import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Badge,
  Button,
  Chip,
  ChipGroup,
  FormScrollView,
  IconButton,
  KeyboardScreen,
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
import { nextFreeDay, SLOT_STATUS_LABELS, type PlanSlot } from '@/domain/plan';
import { channelsWaitingForVisual } from '@/domain/visual';
import { ChannelMark } from '@/features/brand-editors';
import { SLOT_TONES } from '@/features/plan/PlanParts';
import { DayTimePicker, IdeaPicker, RemoveFromPlan, SlotSchedule } from '@/features/plan/SlotPanels';
import { VisualPanel } from '@/features/visual/VisualPanel';
import { formatWeekdayShort, today } from '@/lib/dates';
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

/**
 * Tutto quello che riguarda un'uscita sta qui: giorno, canali e idea in testa,
 * poi la bozza da preparare, ritoccare e approvare.
 */
export function ContentScreen({ brand, slot, content: loaded, loading }: ContentScreenProps) {
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
  const [picking, setPicking] = useState(false);

  // Cambiata l'idea, la bozza vecchia resta in cache finché non si ricarica: non va mostrata.
  const content = loaded && slot && loaded.ideaId !== slot.ideaId ? null : loaded;
  const ideaId = slot ? slot.ideaId : (content?.ideaId ?? null);
  const idea = ideas.find((candidate) => candidate.id === ideaId) ?? null;
  const direct = content !== null && content.ideaId === null;
  /** Un'uscita senza idea e senza un contenuto creato direttamente. */
  const empty = slot !== null && slot.ideaId === null && !slot.contentTitle;
  const channels = slot?.channels ?? content?.channels ?? [];
  const channel = selectedChannel ?? channels[0];
  const variant = content?.variants.find((candidate) => candidate.channel === channel) ?? content?.variants[0] ?? null;
  const format: IdeaFormat = content?.format ?? idea?.formats[0] ?? 'post';
  const formatOptions = direct ? FORMATS : (idea?.formats ?? []);
  const published = slot?.status === 'published';
  const approved = content?.status === 'approved';
  const locked = approved || published;
  const showPicker = slot !== null && !locked && (picking || empty);
  const busy = prepare.isPending || regenerate.isPending;
  const unconnected = channels.filter((candidate) => !isConnected(brand.channels[candidate]));
  const missing = content ? channels.filter((candidate) => !content.variants.some((v) => v.channel === candidate)) : [];
  const text = editing ? draftText : (variant?.text ?? '');
  const check = checkVoice(text, currentVoiceCard(brand.voice), variant ? CHANNEL_LIMITS[variant.channel] : undefined);
  const channelNames = channels.map(channelName).join(' e ');
  const slotWhen = slot ? `${formatWeekdayShort(slot.date)} alle ${slot.time}` : '';
  const design = content?.visual.design ?? null;
  // Instagram e TikTok non pubblicano senza immagine; gli altri canali possono uscire solo testo.
  const waiting = content ? channelsWaitingForVisual(content.format, channels, design) : [];
  const creatingVisual = design?.status === 'creating';
  const withoutImage = content !== null && content.format !== 'video' && design?.status !== 'ready' && waiting.length === 0;
  const approvalBlocked = editing || busy || creatingVisual || waiting.length > 0;
  const explainBlocked = () =>
    toast(
      editing
        ? 'Salva prima il testo.'
        : busy
          ? 'Aspetta che la bozza sia pronta.'
          : creatingVisual
            ? 'Aspetta che il visivo sia pronto.'
            : `${waiting.map(channelName).join(' e ')} non pubblica senza immagine: crea prima il visivo.`,
    );

  const close = () => (router.canGoBack() ? router.back() : router.replace('/plan'));

  const redo = (nextFormat?: IdeaFormat) => {
    const options = {
      onSuccess: () => {
        setEditing(false);
        toast(direct ? 'Bozza rifatta con un altro taglio.' : 'Bozza rifatta.');
      },
      onError: () => toast('Non riesco a preparare la bozza. Riprova.'),
    };
    // La bozza di un'uscita si rifà dall'uscita; le altre (dirette o scritte da un'idea senza data) dal contenuto.
    if (content && (direct || !content.slotId)) regenerate.mutate({ contentId: content.id, format: nextFormat }, options);
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

  return (
    <KeyboardScreen>
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

      <FormScrollView contentContainerStyle={screenStyles.content}>
        <Panel gap={10}>
          {slot ? (
            <SlotSchedule brand={brand} slot={slot} canMove={!published} canChangeChannels={!locked && !direct} />
          ) : (
            <View style={styles.row}>
              <Text variant="strongSmall" style={styles.flex}>
                Non ancora programmato
              </Text>
              <View style={styles.marks}>
                {channels.map((candidate) => (
                  <ChannelMark key={candidate} channel={candidate} active size={24} />
                ))}
              </View>
            </View>
          )}
          {idea && !showPicker && (
            <View style={styles.origin}>
              <Text variant="label">Dall’idea</Text>
              <Text variant="strong">{idea.title}</Text>
              <View style={styles.links}>
                <LinkButton
                  label="Apri l’idea"
                  onPress={() => router.push({ pathname: '/idea/[id]', params: { id: idea.id } })}
                />
                {slot && !locked && <LinkButton label="Cambia idea" onPress={() => setPicking(true)} />}
              </View>
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
        </Panel>

        {showPicker && slot && (
          <IdeaPicker
            brand={brand}
            slot={slot}
            hasDraft={content !== null}
            onCancel={empty ? undefined : () => setPicking(false)}
            onDone={() => setPicking(false)}
          />
        )}

        {(loading || busy) && !empty && (
          <Panel gap={12}>
            <Text variant="strongSmall">{busy ? `Sto scrivendo per ${channelNames}` : 'Carico la bozza'}</Text>
            <SkeletonLines widths={[96, 88, 100, 72, 60]} />
          </Panel>
        )}

        {!loading && !busy && !content && idea && !showPicker && (
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

            <VisualPanel brand={brand} content={content} locked={locked} />

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
                <DayTimePicker date={when.date} time={when.time} channel={channels[0]} onChange={setWhen} />
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

        {slot && !published && !loading && (
          <View style={styles.remove}>
            <RemoveFromPlan brand={brand} slot={slot} direct={direct} onRemoved={close} />
          </View>
        )}
      </FormScrollView>

      {!published && !loading && !showPicker && (idea || content) && (
        <ScreenFooter>
          {!content && (
            <Button size="lg" block busy={prepare.isPending} onPress={() => redo()}>
              {prepare.isPending ? 'Sto preparando la bozza…' : 'Prepara la bozza'}
            </Button>
          )}

          {content && !approved && content.slotId && (
            <>
              {withoutImage && (
                <Text variant="caption" align="center">
                  Esce senza immagine: il visivo non è ancora creato.
                </Text>
              )}
              <Button
                size="lg"
                block
                variant="accent"
                disabled={approvalBlocked}
                busy={approve.isPending}
                onDisabledPress={explainBlocked}
                onPress={approveInSlot}>
                {approve.isPending ? 'Programmo…' : waiting.length > 0 ? 'Crea prima il visivo' : 'Approva e programma'}
              </Button>
              <Button variant="ghost" block busy={busy} onPress={() => redo()}>
                Rifai la bozza
              </Button>
            </>
          )}

          {content && !approved && !content.slotId && !when && (
            <>
              {withoutImage && (
                <Text variant="caption" align="center">
                  Esce senza immagine: il visivo non è ancora creato.
                </Text>
              )}
              <Button
                size="lg"
                block
                variant="accent"
                disabled={approvalBlocked}
                onDisabledPress={explainBlocked}
                onPress={openScheduling}>
                {waiting.length > 0 ? 'Crea prima il visivo' : 'Approva e scegli quando'}
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
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  marks: { flexDirection: 'row', gap: 4 },
  origin: { gap: 4, borderTopWidth: 1, borderTopColor: colors.borderSubtle, paddingTop: 10 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  links: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 18 },
  remove: { alignItems: 'center' },
});
