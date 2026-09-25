import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, X } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInLeft, FadeInRight } from 'react-native-reanimated';

import {
  Badge,
  Button,
  FormScrollView,
  IconButton,
  KeyboardScreen,
  LinkButton,
  Panel,
  ProgressSegments,
  ScreenFooter,
  ScreenTitle,
  SkeletonLines,
  StepList,
  Text,
  TopBar,
  colors,
  motion,
  screenStyles,
  standardEasing,
  useToast,
} from '@/design-system';
import { isConnected, type Brand, type ChannelId } from '@/domain/brand';
import { channelName } from '@/domain/catalog';
import { channelsWaitingForVideo, channelsWithoutImage, type Content } from '@/domain/content';
import { FORMAT_LABELS, type IdeaFormat } from '@/domain/idea';
import { nextFreeDay, SLOT_STATUS_LABELS, type PlanSlot } from '@/domain/plan';
import { channelsWaitingForVisual } from '@/domain/visual';
import { ChannelMark } from '@/features/brand-editors';
import { SLOT_TONES } from '@/features/plan/PlanParts';
import { IdeaPicker, RemoveFromPlan, SlotSchedule } from '@/features/plan/SlotPanels';
import { formatWeekdayShort, today } from '@/lib/dates';
import type { JobKind } from '@/services/types';
import {
  useContentJob,
  useIdeas,
  usePlan,
  usePrepareContent,
  useRegenerateContent,
  useReopenContent,
  useRewriteVariant,
  useScheduleContent,
} from '@/services/queries';

import {
  CONTENT_STEPS,
  RetouchBar,
  ReviewStep,
  TextStep,
  VisualStep,
  WhenStep,
  describeBrief,
  type ContentStep,
  type WhenChoice,
} from './ContentSteps';

const FORMATS = Object.keys(FORMAT_LABELS) as IdeaFormat[];

const STEP_COPY: Record<ContentStep, { name: string; title: string }> = {
  text: { name: 'Testo', title: 'Il testo' },
  visual: { name: 'Visivo', title: 'Il visivo' },
  when: { name: 'Quando', title: 'Quando esce' },
  review: { name: 'Riepilogo', title: 'Ci siamo' },
};

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

/** I lavori che scrivono la bozza: i loro passi vanno nel corpo della schermata, al posto del testo. */
const WRITING_JOBS: JobKind[] = ['content-prepare', 'content-direct', 'content-from-idea', 'content-regenerate'];

/**
 * Un contenuto si fa in quattro passi: prima il testo, poi il visivo, poi quando esce
 * (in calendario, subito, o per niente) e infine il riepilogo da confermare.
 */
export function ContentScreen({ brand, slot, content: loaded, loading }: ContentScreenProps) {
  const router = useRouter();
  const toast = useToast();
  const { data: ideas = [] } = useIdeas(brand.id);
  const { data: planSlots = [] } = usePlan(brand.id);
  const prepare = usePrepareContent(brand.id);
  const regenerate = useRegenerateContent();
  const schedule = useScheduleContent(brand.id);
  const reopen = useReopenContent(brand.id);
  const rewrite = useRewriteVariant();
  /**
   * Una generazione può essere partita prima (altra schermata, app chiusa, telefono in standby):
   * se è ancora in corso ci si rimette a guardarla da dov'è arrivata. Senza bozza il lavoro si
   * cerca dall'uscita, perché è quello che sta scrivendo la bozza che ancora non c'è.
   */
  const running = useContentJob(
    (loaded && slot && loaded.ideaId !== slot.ideaId ? undefined : loaded?.id) ?? slot?.id,
    !prepare.isPending && !regenerate.isPending && !rewrite.isPending,
  );

  // Il passo sta nell'indirizzo, non in uno stato locale: così non si perde se la schermata si rimonta.
  const { step: stepParam } = useLocalSearchParams<{ step?: string }>();
  const step = CONTENT_STEPS.includes(stepParam as ContentStep) ? (stepParam as ContentStep) : 'text';
  const [direction, setDirection] = useState<1 | -1>(1);
  const [selectedChannel, setSelectedChannel] = useState<ChannelId | null>(null);
  const [editing, setEditing] = useState(false);
  const [choice, setChoice] = useState<WhenChoice | null>(null);
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
  const format: IdeaFormat = content?.format ?? idea?.formats[0] ?? 'post';
  const formats = direct ? FORMATS : (idea?.formats ?? []);
  const published = slot?.status === 'published';
  const approved = content?.status === 'approved';
  const locked = approved || published;
  const showPicker = slot !== null && !locked && (picking || empty);
  /**
   * Un lavoro ripreso ha i suoi passi nel punto giusto: la riscrittura accanto al testo del
   * canale, il visivo nel pannello della card. Qui si aspetta solo chi scrive la bozza.
   */
  const resumingWrite = running.resuming && WRITING_JOBS.includes(running.kind ?? 'website');
  const busy = prepare.isPending || regenerate.isPending || resumingWrite;
  /** I passi dell'AI mentre scrive: vengono da chi dei tre sta lavorando. */
  const writingSteps = prepare.isPending ? prepare.steps : resumingWrite ? running.steps : regenerate.steps;
  const channelNames = channels.map(channelName).join(' e ');
  const slotWhen = slot ? `${formatWeekdayShort(slot.date)} alle ${slot.time}` : 'bozza';
  const design = content?.visual.design ?? null;
  // Instagram e TikTok non pubblicano senza immagine; gli altri canali possono uscire solo testo, se lo scegli.
  const waiting = content ? channelsWaitingForVisual(content.format, channels, design, channelsWithoutImage(content)) : [];
  const creatingVisual = design?.status === 'creating';
  /** Un video con dei cartelli si programma, ma non esce adesso. */
  const videoWaiting = content ? channelsWaitingForVideo(content) : [];
  const unconnected = channels.filter((candidate) => !isConnected(brand.channels[candidate]));

  // Approvato o pubblicato si guarda soltanto: il riepilogo racconta com'è uscito.
  const current: ContentStep = locked ? 'review' : step;
  const index = CONTENT_STEPS.indexOf(current);
  const when: WhenChoice = choice ?? {
    mode: 'schedule',
    ...(slot ? { date: slot.date, time: slot.time } : nextFreeDay(planSlots, channels[0], today())),
  };

  const close = () => (router.canGoBack() ? router.back() : router.replace('/plan'));

  const goTo = (next: ContentStep) => {
    setDirection(CONTENT_STEPS.indexOf(next) >= index ? 1 : -1);
    router.setParams({ step: next });
  };

  const back = () => {
    if (index === 0) {
      close();
      return;
    }
    goTo(CONTENT_STEPS[index - 1]);
  };

  const redo = (nextFormat?: IdeaFormat) => {
    const options = {
      onSuccess: () => {
        setEditing(false);
        toast(nextFormat ? 'Bozza rifatta con un altro taglio.' : 'Bozza rifatta.');
      },
      onError: () => toast('Non riesco a preparare la bozza. Riprova.'),
    };
    // La bozza di un'uscita si rifà dall'uscita; le altre (dirette o scritte da un'idea senza data) dal contenuto.
    if (content && (direct || !content.slotId)) regenerate.mutate({ contentId: content.id, format: nextFormat }, options);
    else if (slot) prepare.mutate({ slotId: slot.id, format: nextFormat }, options);
  };

  const manualReminder =
    unconnected.length > 0
      ? ` ${unconnected.map(channelName).join(' e ')} non è collegato: all’orario ti ricordo di pubblicarla a mano.`
      : '';

  /** L'ultimo passo: il contenuto entra nel piano, esce subito, o resta com'è. */
  const confirm = () => {
    if (!content) return;
    if (when.mode === 'draft') {
      toast(slot ? 'Resta nel piano da approvare.' : 'Salvata tra le bozze da programmare.');
      close();
      return;
    }
    const target = when.mode === 'now' ? { date: today(), time: nowTime() } : { date: when.date, time: when.time };
    schedule.mutate(
      { contentId: content.id, ...target, publishNow: when.mode === 'now' },
      {
        onSuccess: () => {
          toast(
            when.mode === 'now'
              ? `Pubblicata su ${channelNames}.`
              : `Programmata per ${formatWeekdayShort(target.date)} alle ${target.time}.${manualReminder}`,
          );
          router.dismissTo('/plan');
        },
        onError: () => toast('Non riesco a programmarla. Riprova.'),
      },
    );
  };

  /** Perché il passo non si può lasciare: nulla se si può andare avanti. */
  const blocked: string | null = busy
    ? 'Aspetta che la bozza sia pronta.'
    : current === 'text'
      ? editing
        ? 'Salva prima il testo.'
        : null
      : current === 'visual'
        ? creatingVisual
          ? 'Aspetta che il visivo sia pronto.'
          : waiting.length > 0
            ? `${waiting.map(channelName).join(' e ')} non pubblica senza immagine: crea prima il visivo.`
            : null
        : null;

  /** L'azione del passo: manca solo mentre si sceglie l'idea e su un'uscita già pubblicata. */
  const footer = showPicker || loading ? null : current === 'text' ? (
    content ? (
      // Un solo pulsante, nello stesso posto in tutti i passi: «Rifai la bozza» sta nella barra dei ritocchi.
      <Button
        size="lg"
        block
        disabled={blocked !== null}
        onDisabledPress={() => blocked && toast(blocked)}
        onPress={() => goTo('visual')}>
        Continua col visivo
      </Button>
    ) : idea ? (
      <Button size="lg" block busy={prepare.isPending} onPress={() => redo()}>
        {prepare.isPending ? 'Sto scrivendo…' : 'Prepara la bozza'}
      </Button>
    ) : null
  ) : !content ? null : current === 'visual' ? (
    <>
      {waiting.length === 0 && content.format !== 'video' && design?.status !== 'ready' && (
        <Text variant="caption" align="center">
          Esce senza immagine: il visivo non è ancora creato.
        </Text>
      )}
      <Button
        size="lg"
        block
        disabled={blocked !== null}
        onDisabledPress={() => blocked && toast(blocked)}
        onPress={() => goTo('when')}>
        {waiting.length > 0 ? 'Crea prima il visivo' : 'Continua'}
      </Button>
    </>
  ) : current === 'when' ? (
    <Button
      size="lg"
      block
      disabled={when.mode === 'now' && videoWaiting.length > 0}
      onDisabledPress={() =>
        toast(`Il video non è pronto per ${videoWaiting.map(channelName).join(' e ')}: monta coi girati, senza cartelli. Programmarlo intanto si può.`)
      }
      onPress={() => goTo('review')}>
      Continua
    </Button>
  ) : !locked ? (
    <Button size="lg" block variant="accent" busy={schedule.isPending} onPress={confirm}>
      {schedule.isPending
        ? 'Ci penso io…'
        : when.mode === 'now'
          ? 'Pubblica adesso'
          : when.mode === 'draft'
            ? 'Salva senza pubblicare'
            : `Programma per ${formatWeekdayShort(when.date)} alle ${when.time}`}
    </Button>
  ) : published ? null : (
    <Button
      size="lg"
      block
      variant="secondary"
      busy={reopen.isPending}
      onPress={() =>
        reopen.mutate(content.id, {
          onSuccess: () => {
            goTo('text');
            toast('Di nuovo in bozza: la richiudi quando è pronta.');
          },
          onError: () => toast('Non riesco a riaprire la bozza. Riprova.'),
        })
      }>
      Riapri la bozza
    </Button>
  );

  const stepTitle = STEP_COPY[current].title;
  const subtitle = busy
    ? 'Sto rifacendo la bozza: un attimo e torni dov’eri.'
    : current === 'text'
      ? content
        ? 'Ritocca quello che non ti torna: chiedimelo a parole o scrivilo tu.'
        : `Scrivo il testo per ${channelNames} seguendo la tua scheda voce.`
      : current === 'visual'
        ? content?.format === 'video'
          ? 'Lo script e la regia del video: cosa giri tu, cosa parte dalle tue foto, cosa genero io.'
          : 'La card che accompagna il testo, con i colori e i caratteri del brand.'
        : current === 'when'
          ? 'Mettila in calendario, falla uscire adesso, oppure tienila da parte.'
          : locked
            ? published
              ? 'È uscita così.'
              : 'È in calendario. La riapri quando vuoi.'
            : 'Un ultimo sguardo, poi la chiudiamo.';

  return (
    <KeyboardScreen>
      <TopBar
        left={
          locked ? (
            <IconButton icon={X} accessibilityLabel="Chiudi" onPress={close} />
          ) : (
            <IconButton
              icon={index === 0 ? X : ChevronLeft}
              accessibilityLabel={index === 0 ? 'Chiudi' : 'Passo precedente'}
              onPress={back}
            />
          )
        }
        title={locked ? 'Contenuto' : `Passo ${index + 1} di ${CONTENT_STEPS.length} · ${STEP_COPY[current].name}`}
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
        }>
        {!locked && <ProgressSegments count={CONTENT_STEPS.length} current={index} />}
      </TopBar>

      <FormScrollView key={current} contentContainerStyle={screenStyles.content}>
        <Animated.View
          entering={(direction === 1 ? FadeInRight : FadeInLeft).duration(motion.slow).easing(standardEasing)}
          style={styles.body}>
          <ScreenTitle title={stepTitle} subtitle={subtitle} />

          {/* Mentre la bozza si scrive i passi si vedono nel passo in cui sei: il lavoro segue te, non il contrario. */}
          {busy && !empty && (
            <Panel gap={12}>
              <StepList steps={writingSteps} waiting="Rileggo il profilo" />
            </Panel>
          )}

          {current === 'text' && !busy && (
            <>
              <Panel gap={10}>
                {slot ? (
                  <SlotSchedule brand={brand} slot={slot} canMove={false} canChangeChannels={!locked && !direct} />
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

              {loading && !empty && (
                <Panel gap={12}>
                  <Text variant="strongSmall">Carico la bozza</Text>
                  <SkeletonLines widths={[96, 88, 100, 72, 60]} />
                </Panel>
              )}

              {!loading && !busy && !content && idea && !showPicker && (
                <Panel label="Da preparare" gap={10}>
                  <Text variant="body" color={colors.textTitle}>
                    Scrivo il testo per {channelNames} seguendo la tua scheda voce. Il visivo lo vediamo al passo dopo.
                  </Text>
                  {formats.length > 1 && (
                    <Text variant="caption">Formato: {FORMAT_LABELS[format]}. Potrai cambiarlo dopo.</Text>
                  )}
                </Panel>
              )}

              {content && !busy && !showPicker && (
                <TextStep
                  brand={brand}
                  content={content}
                  channels={channels}
                  channel={channel}
                  onChannel={setSelectedChannel}
                  onRedo={redo}
                  locked={locked}
                  editing={editing}
                  onEditing={setEditing}
                  when={slotWhen}
                  rewriting={rewrite.isPending || running.kind === 'content-rewrite'}
                  steps={running.kind === 'content-rewrite' ? running.steps : rewrite.steps}
                />
              )}

              {slot && !published && !loading && (
                <View style={styles.remove}>
                  <RemoveFromPlan brand={brand} slot={slot} direct={direct} onRemoved={close} />
                </View>
              )}
            </>
          )}

          {current === 'visual' && content && !busy && (
            <VisualStep
              brand={brand}
              content={content}
              channels={channels}
              channel={channel}
              onChannel={setSelectedChannel}
              locked={locked}
              drawingSteps={running.kind === 'visual-design' ? running.steps : undefined}
              cuttingSteps={running.kind === 'video-cut' ? running.steps : undefined}
            />
          )}

          {current === 'when' && content && (
            <WhenStep brand={brand} content={content} channels={channels} slot={slot} choice={when} onChoice={setChoice} />
          )}

          {current === 'review' && content && (
            <ReviewStep
              brand={brand}
              content={content}
              channels={channels}
              slot={slot}
              channel={channel}
              onChannel={setSelectedChannel}
              choice={when}
              locked={locked}
              onEdit={goTo}
            />
          )}
        </Animated.View>
      </FormScrollView>

      {current === 'text' && content && !showPicker && !busy && !locked && (
        <RetouchBar
          busy={rewrite.isPending}
          editing={editing}
          onManual={() => setEditing(true)}
          onRedo={() => redo()}
          onAsk={(instruction) =>
            rewrite.mutate(
              { contentId: content.id, channel, instruction },
              {
                onSuccess: () => toast('Testo rivisto.'),
                onError: () => toast('Non riesco a rivedere il testo. Riprova.'),
              },
            )
          }
        />
      )}

      {footer && <ScreenFooter>{footer}</ScreenFooter>}
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  body: { gap: 14 },
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  marks: { flexDirection: 'row', gap: 4 },
  origin: { gap: 4, borderTopWidth: 1, borderTopColor: colors.borderSubtle, paddingTop: 10 },
  links: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 18 },
  remove: { alignItems: 'center' },
});
