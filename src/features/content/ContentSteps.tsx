import { useRouter } from 'expo-router';
import { ArrowUp, ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  Button,
  Chip,
  ChipGroup,
  IconButton,
  LinkButton,
  Panel,
  RadioMark,
  SegmentedControl,
  StatusDot,
  StepList,
  SunkenInput,
  Text,
  colors,
  palette,
  radii,
  useToast,
} from '@/design-system';
import { currentVoiceCard, isConnected, type Brand, type ChannelId } from '@/domain/brand';
import { CHANNEL_FORMATS, channelName } from '@/domain/catalog';
import {
  CHANNEL_LIMITS,
  REWRITE_INSTRUCTIONS,
  REWRITE_LIMIT,
  channelsWithoutImage,
  checkVoice,
  renderableFormats,
  variantFormat,
  type Content,
} from '@/domain/content';
import { FORMAT_LABELS, type IdeaFormat, type IdeaSource } from '@/domain/idea';
import type { PlanSlot } from '@/domain/plan';
import { channelsWaitingForVisual, needsMedia } from '@/domain/visual';
import { DayTimePicker } from '@/features/plan/SlotPanels';
import { VisualPanel } from '@/features/visual/VisualPanel';
import { formatWeekdayShort } from '@/lib/dates';
import { useEditVariant, useSetVariantLayout } from '@/services/queries';
import type { AiStep } from '@/services/types';

import { PostPreview, ScenesPanel, VisualPreview, VoicePanel } from './ContentParts';

/** I quattro passi di un contenuto: prima il testo, poi il visivo, poi quando esce, infine la conferma. */
export const CONTENT_STEPS = ['text', 'visual', 'when', 'review'] as const;

export type ContentStep = (typeof CONTENT_STEPS)[number];

/** Cosa si fa del contenuto alla fine: entra nel piano, esce subito, o resta una bozza. */
export type WhenMode = 'schedule' | 'now' | 'draft';

export interface WhenChoice {
  mode: WhenMode;
  date: string;
  time: string;
}

export function describeBrief(brief: IdeaSource): string {
  if (brief.kind === 'prompt') return brief.text;
  if (brief.kind === 'link') return brief.note ? `${brief.url} · ${brief.note}` : brief.url;
  return brief.note ? `${brief.name} · ${brief.note}` : brief.name;
}

// ---------------------------------------------------------------------------
// 1. Il testo
// ---------------------------------------------------------------------------

export interface TextStepProps {
  brand: Brand;
  content: Content;
  /** I canali dell'uscita, che possono essere più di quelli già scritti nella bozza. */
  channels: ChannelId[];
  channel: ChannelId;
  onChannel: (channel: ChannelId) => void;
  /** Rifà la bozza, con un altro formato se serve. */
  onRedo: (format?: IdeaFormat) => void;
  locked: boolean;
  editing: boolean;
  onEditing: (editing: boolean) => void;
  when: string;
  /** I passi dell'AI mentre riscrive, se sta riscrivendo. */
  rewriting: boolean;
  steps: AiStep[];
}

/** Solo il testo: il post come apparirà, senza visivo. I ritocchi stanno nella barra in basso. */
export function TextStep({
  brand,
  content,
  channels,
  channel,
  onChannel,
  onRedo,
  locked,
  editing,
  onEditing,
  when,
  rewriting,
  steps,
}: TextStepProps) {
  const toast = useToast();
  const editVariant = useEditVariant();
  // La modifica a mano parte dal testo del canale e si azzera quando il testo cambia sotto.
  const [typed, setTyped] = useState<{ key: string; text: string } | null>(null);

  const variant = content.variants.find((candidate) => candidate.channel === channel) ?? content.variants[0];
  if (!variant) return null;
  const missing = channels.filter((candidate) => !content.variants.some((entry) => entry.channel === candidate));
  const editKey = `${content.id}|${variant.channel}|${content.updatedAt}`;
  const draftText = typed?.key === editKey ? typed.text : variant.text;

  const saveEdit = () =>
    editVariant.mutate(
      { contentId: content.id, channel: variant.channel, text: draftText.trim() },
      {
        onSuccess: () => {
          setTyped(null);
          onEditing(false);
          toast('Testo aggiornato.');
        },
        onError: () => toast('Modifica non salvata. Riprova.'),
      },
    );

  return (
    <>
      {channels.length > 1 && (
        <SegmentedControl
          accessibilityLabel="Canale"
          value={channel}
          onChange={(next) => {
            onEditing(false);
            onChannel(next);
          }}
          options={channels.map((candidate) => ({ value: candidate, label: channelName(candidate) }))}
        />
      )}

      {missing.length > 0 && !locked && (
        <Panel gap={6}>
          <Text variant="caption" color={colors.textTitle}>
            La bozza non include {missing.map(channelName).join(' e ')}: rifalla per aggiungerli.
          </Text>
          <LinkButton label="Rifai la bozza" onPress={() => onRedo()} />
        </Panel>
      )}

      {rewriting ? (
        <Panel gap={12}>
          <Text variant="strongSmall">Rivedo il testo per {channelName(variant.channel)}</Text>
          <StepList steps={steps} waiting="Rileggo la bozza" />
        </Panel>
      ) : editing ? (
        <Panel label={`Testo per ${channelName(variant.channel)}`} gap={10}>
          <SunkenInput
            multiline
            minHeight={220}
            value={draftText}
            onChangeText={(text) => setTyped({ key: editKey, text })}
            autoFocus
            accessibilityLabel={`Testo per ${channelName(variant.channel)}`}
          />
          <Text
            variant="caption"
            color={draftText.length > CHANNEL_LIMITS[variant.channel] ? colors.warning : colors.textBody}>
            {draftText.length}/{CHANNEL_LIMITS[variant.channel]} caratteri
          </Text>
          <View style={styles.actions}>
            <Button
              size="sm"
              variant="ghost"
              onPress={() => {
                setTyped(null);
                onEditing(false);
              }}>
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
          when={when}
          withVisual={false}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

export interface RetouchBarProps {
  /** Chiede un ritocco: un suggerimento pronto o una richiesta scritta a mano. */
  onAsk: (instruction: string) => void;
  onManual: () => void;
  /** Rifà la bozza da capo: sta qui, lontano dal pulsante che porta avanti. */
  onRedo: () => void;
  busy: boolean;
  /** Mentre si modifica a mano la barra dei ritocchi lascia il posto al testo. */
  editing: boolean;
}

/**
 * La barra sotto il testo: i ritocchi pronti, la richiesta scritta come la diresti, e la
 * modifica a mano. Sta fuori dallo scorrimento, sopra il piede, sempre a portata di pollice.
 */
export function RetouchBar({ onAsk, onManual, onRedo, busy, editing }: RetouchBarProps) {
  const [request, setRequest] = useState('');

  if (editing) return null;

  const send = () => {
    const asked = request.trim();
    if (!asked || busy) return;
    setRequest('');
    onAsk(asked);
  };

  return (
    <View style={styles.bar}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestions}>
        {REWRITE_INSTRUCTIONS.map((instruction) => (
          <Chip key={instruction} size="sm" label={instruction} onPress={() => !busy && onAsk(instruction)} />
        ))}
      </ScrollView>
      <View style={styles.composer}>
        <SunkenInput
          value={request}
          onChangeText={setRequest}
          placeholder="Dimmi cosa cambiare…"
          maxLength={REWRITE_LIMIT}
          accessibilityLabel="Chiedi una modifica"
          returnKeyType="send"
          onSubmitEditing={send}
          style={styles.flex}
        />
        <IconButton
          icon={ArrowUp}
          variant="solid"
          accessibilityLabel="Chiedi la modifica"
          disabled={busy || !request.trim()}
          onPress={send}
        />
      </View>
      <View style={styles.links}>
        <LinkButton label="Modifica il testo a mano" onPress={onManual} />
        <LinkButton label="Rifai la bozza" tone="muted" onPress={onRedo} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// 2. Il visivo
// ---------------------------------------------------------------------------

export interface VisualStepProps {
  brand: Brand;
  content: Content;
  channels: ChannelId[];
  /** Il canale che si sta guardando: il visivo si sceglie canale per canale. */
  channel: ChannelId;
  onChannel: (channel: ChannelId) => void;
  locked: boolean;
  /** I passi di un disegno della card ripreso da prima: senza, li mostra chi l'ha chiesto. */
  drawingSteps?: AiStep[];
}

/**
 * Il visivo, canale per canale: il formato con cui esce lì e, dove il canale lo permette, nessuna immagine.
 * Il testo non si tocca: qui si decide solo come si vede.
 */
export function VisualStep({ brand, content, channels, channel, onChannel, locked, drawingSteps }: VisualStepProps) {
  const toast = useToast();
  const setLayout = useSetVariantLayout();

  const variant = content.variants.find((candidate) => candidate.channel === channel);
  const format = variantFormat(content, channel);
  const withoutImage = variant?.withoutImage === true;
  const skipped = channelsWithoutImage(content);
  const waiting = channelsWaitingForVisual(content.format, channels, content.visual.design, skipped);
  // Quelli che il canale accetta e che la bozza sa già rendere: per gli altri si rifà il testo.
  const renderable = renderableFormats(content.format);
  const options = CHANNEL_FORMATS[channel].filter((candidate) => renderable.includes(candidate));
  // Instagram e TikTok non pubblicano senza immagine: là l'opzione non c'è.
  const canSkipImage = !needsMedia(channel);
  /** La card serve ancora a qualcuno? Se tutti i canali escono senza immagine, non c'è niente da comporre. */
  const cardUsed = channels.some((candidate) => !skipped.includes(candidate) && variantFormat(content, candidate) !== 'video');

  const apply = (layout: { format?: IdeaFormat; withoutImage?: boolean }, done: string) =>
    setLayout.mutate(
      { content, channel, layout },
      { onSuccess: () => toast(done), onError: () => toast('Scelta non salvata. Riprova.') },
    );

  return (
    <>
      {channels.length > 1 && (
        <SegmentedControl
          accessibilityLabel="Canale"
          value={channel}
          onChange={onChannel}
          options={channels.map((candidate) => ({ value: candidate, label: channelName(candidate) }))}
        />
      )}

      {!locked && (
        <Panel label={`Come esce su ${channelName(channel)}`} gap={8}>
          <ChipGroup>
            {options.map((candidate) => (
              <Chip
                key={candidate}
                size="sm"
                label={FORMAT_LABELS[candidate]}
                selected={!withoutImage && candidate === format}
                onPress={() =>
                  (candidate !== format || withoutImage) &&
                  apply({ format: candidate, withoutImage: false }, `Su ${channelName(channel)}: ${FORMAT_LABELS[candidate].toLowerCase()}.`)
                }
              />
            ))}
            {canSkipImage && (
              <Chip
                size="sm"
                label="Nessuna immagine"
                selected={withoutImage}
                onPress={() => !withoutImage && apply({ withoutImage: true }, `Su ${channelName(channel)} esce solo testo.`)}
              />
            )}
          </ChipGroup>
          <Text variant="caption">
            {withoutImage
              ? 'Esce solo il testo: nessuna card su questo canale.'
              : 'Cambia solo il visivo di questo canale: il testo resta quello che hai scritto.'}
            {content.format !== 'video' ? ' Per un video servono le scene: rifai la bozza dal testo.' : ''}
          </Text>
        </Panel>
      )}

      {withoutImage ? (
        <Panel gap={6}>
          <Text variant="strongSmall">Solo testo su {channelName(channel)}</Text>
          <Text variant="caption">Gli altri canali tengono la loro card.</Text>
        </Panel>
      ) : format === 'video' ? (
        <>
          <ScenesPanel scenes={content.visual.scenes} />
          <Text variant="caption">
            Le scene «Da girare» le riprendi tu; le altre le genero io quando il video entra in lavorazione.
          </Text>
        </>
      ) : (
        // La card sta qui, nel suo passo: si vede mentre si crea e quando è pronta, nel taglio del canale.
        <VisualPreview brand={brand} format={format} visual={content.visual} channel={channel} />
      )}

      {cardUsed && !withoutImage && format !== 'video' && <VisualPanel brand={brand} content={content} channel={channel} locked={locked} drawingSteps={drawingSteps} />}

      {!locked && waiting.length > 0 && (
        <Text variant="caption" color={colors.textTitle}>
          {waiting.map(channelName).join(' e ')} non pubblica senza immagine: lì il visivo serve.
        </Text>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// 3. Quando esce
// ---------------------------------------------------------------------------

interface WhenOption {
  mode: WhenMode;
  label: string;
  detail: string;
}

export interface WhenStepProps {
  brand: Brand;
  content: Content;
  channels: ChannelId[];
  slot: PlanSlot | null;
  choice: WhenChoice;
  onChoice: (choice: WhenChoice) => void;
}

/** La scelta di fondo: calendario, subito, o nessuna data. */
export function WhenStep({ brand, content, channels, slot, choice, onChoice }: WhenStepProps) {
  const channel = channels[0];
  const unconnected = channels.filter((candidate) => !isConnected(brand.channels[candidate]));
  const options: WhenOption[] = [
    {
      mode: 'schedule',
      label: 'Programmala',
      detail: slot ? 'Resta nel piano, nel giorno che scegli qui sotto.' : 'Entra nel piano nel giorno che scegli qui sotto.',
    },
    { mode: 'now', label: 'Pubblicala adesso', detail: `Esce subito su ${channels.map(channelName).join(' e ')}.` },
    {
      mode: 'draft',
      label: 'Salvala senza pubblicare',
      detail: slot ? 'Resta nel piano da approvare: la programmi quando vuoi.' : 'Resta tra le bozze da programmare.',
    },
  ];

  return (
    <>
      <Panel gap={0} style={styles.choices}>
        {options.map((option, i) => {
          const selected = option.mode === choice.mode;
          return (
            <Pressable
              key={option.mode}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={option.label}
              onPress={() => onChoice({ ...choice, mode: option.mode })}
              style={({ pressed }) => [styles.choice, i > 0 && styles.divider, pressed && styles.pressed]}>
              <View style={styles.choiceDot}>
                <RadioMark selected={selected} />
              </View>
              <View style={styles.choiceTexts}>
                <Text variant="strongSmall" color={selected ? colors.textTitle : colors.textBody}>
                  {option.label}
                </Text>
                <Text variant="caption">{option.detail}</Text>
              </View>
            </Pressable>
          );
        })}
      </Panel>

      {choice.mode === 'schedule' && (
        <Panel label="Giorno e ora" gap={10}>
          <DayTimePicker
            date={choice.date}
            time={choice.time}
            channel={channel}
            onChange={(next) => onChoice({ ...choice, ...next })}
          />
          <Text variant="caption">
            {slot
              ? 'L’uscita è già nel piano: se cambi giorno o ora la sposto.'
              : `Ti propongo il primo giorno libero adatto a ${channelName(channel)}.`}
          </Text>
        </Panel>
      )}

      {choice.mode !== 'draft' && unconnected.length > 0 && (
        <Text variant="caption">
          {unconnected.map(channelName).join(' e ')} non è collegato: all’orario ti ricordo di pubblicarla a mano.
        </Text>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// 4. Riepilogo
// ---------------------------------------------------------------------------

export interface ReviewStepProps {
  brand: Brand;
  content: Content;
  channels: ChannelId[];
  slot: PlanSlot | null;
  channel: ChannelId;
  onChannel: (channel: ChannelId) => void;
  choice: WhenChoice;
  locked: boolean;
  /** Torna a un passo per cambiare qualcosa. */
  onEdit: (step: ContentStep) => void;
}

/** L'ultimo sguardo prima di confermare: il post com'è, e le righe da ricontrollare. */
export function ReviewStep({ brand, content, channels, slot, channel, onChannel, choice, locked, onEdit }: ReviewStepProps) {
  const router = useRouter();
  const variant = content.variants.find((candidate) => candidate.channel === channel) ?? content.variants[0];
  const ideaId = content.ideaId;
  const design = content.visual.design;
  const skipped = channelsWithoutImage(content);
  const waiting = channelsWaitingForVisual(content.format, channels, design, skipped);
  const published = slot?.status === 'published';

  const whenLine = locked
    ? slot
      ? `${published ? 'Uscita' : 'Esce'} ${formatWeekdayShort(slot.date)} alle ${slot.time}`
      : 'Salvata come bozza'
    : choice.mode === 'now'
      ? 'Adesso, appena confermi'
      : choice.mode === 'draft'
        ? slot
          ? 'Nessuna pubblicazione: resta nel piano da approvare'
          : 'Nessuna data: resta tra le bozze'
        : `${formatWeekdayShort(choice.date)} alle ${choice.time}`;

  const soloText = skipped.length > 0 ? ` · solo testo su ${skipped.map(channelName).join(' e ')}` : '';
  const visualLine =
    content.format === 'video'
      ? `${content.visual.scenes.length} scene`
      : design?.status === 'ready'
        ? `${design.pages.length > 1 ? `Card pronta · ${design.pages.length} slide` : 'Card pronta'}${soloText}`
        : design?.status === 'creating'
          ? 'In creazione'
          : waiting.length > 0
            ? `Da creare: ${waiting.map(channelName).join(' e ')} lo richiede`
            : `Nessuno: esce solo testo`;

  /** Il formato riga per riga, che ormai può cambiare da canale a canale. */
  const formatLine = [...new Set(channels.map((candidate) => FORMAT_LABELS[variantFormat(content, candidate)]))].join(' e ');

  const rows: { step: ContentStep; label: string; value: string; ok: boolean }[] = [
    {
      step: 'text',
      label: 'Testo',
      value: `${channels.map(channelName).join(' e ')} · ${formatLine}`,
      ok: true,
    },
    { step: 'visual', label: 'Visivo', value: visualLine, ok: waiting.length === 0 && design?.status !== 'creating' },
    { step: 'when', label: 'Quando', value: whenLine, ok: choice.mode !== 'draft' || locked },
  ];

  return (
    <>
      {channels.length > 1 && (
        <SegmentedControl
          accessibilityLabel="Canale"
          value={channel}
          onChange={onChannel}
          options={channels.map((candidate) => ({ value: candidate, label: channelName(candidate) }))}
        />
      )}

      {variant && (
        <PostPreview
          brand={brand}
          variant={variant}
          format={variantFormat(content, variant.channel)}
          visual={content.visual}
          when={locked && slot ? `${formatWeekdayShort(slot.date)} alle ${slot.time}` : whenLine.toLowerCase()}
          withVisual={!variant.withoutImage}
        />
      )}

      <Panel gap={0} style={styles.rows}>
        {rows.map((row, i) => (
          <Pressable
            key={row.step}
            accessibilityRole="button"
            accessibilityLabel={`${row.label}: ${row.value}`}
            accessibilityHint={locked ? undefined : 'Torna al passo per cambiarlo'}
            disabled={locked}
            onPress={() => onEdit(row.step)}
            style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && styles.pressed]}>
            <View style={styles.choiceDot}>
              <StatusDot tone={row.ok ? 'complete' : 'partial'} size={12} />
            </View>
            <View style={styles.choiceTexts}>
              <Text variant="strongSmall">{row.label}</Text>
              <Text variant="caption">{row.value}</Text>
            </View>
            {!locked && <ChevronRight size={16} color={palette.grey300} />}
          </Pressable>
        ))}
      </Panel>

      <VoicePanel check={checkVoice(variant?.text ?? '', currentVoiceCard(brand.voice), CHANNEL_LIMITS[channel])} />

      {ideaId && (
        <LinkButton
          label="Apri l’idea di partenza"
          onPress={() => router.push({ pathname: '/idea/[id]', params: { id: ideaId } })}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  links: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 18 },
  bar: {
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    backgroundColor: colors.surfaceCard,
  },
  suggestions: { gap: 8, paddingRight: 18 },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  choices: { borderRadius: radii.card, paddingVertical: 4 },
  choice: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12 },
  choiceDot: { paddingTop: 2 },
  choiceTexts: { flex: 1, minWidth: 0, gap: 2 },
  rows: { borderRadius: radii.card, paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12 },
  divider: { borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  pressed: { opacity: 0.7 },
});
