import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Chip,
  ChipGroup,
  Dot,
  LinkButton,
  Panel,
  PressableScale,
  Text,
  colors,
  radii,
  useToast,
} from '@/design-system';
import type { Brand, ChannelId } from '@/domain/brand';
import { channelName } from '@/domain/catalog';
import { BEST_TIMES, channelsWithIdea, rankIdeasForSlot, selectedChannels, type PlanSlot } from '@/domain/plan';
import { ChannelMark } from '@/features/brand-editors';
import { addDays, formatWeekdayLong, formatWeekdayShort, today } from '@/lib/dates';
import { useIdeas, usePlan, useRemoveSlot, useUpdateSlot } from '@/services/queries';
import type { SlotPatch } from '@/services/types';

const TIMES = ['08:30', '12:30', '13:00', '18:30', '19:00'];

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** I giorni delle prossime due settimane e gli orari tipici, con quello consigliato per il canale. */
export function DayTimePicker({
  date,
  time,
  channel,
  onChange,
}: {
  date: string;
  time: string;
  channel: ChannelId;
  onChange: (next: { date: string; time: string }) => void;
}) {
  const days = Array.from({ length: 14 }, (_, i) => addDays(today(), i + 1));
  const times = [...new Set([time, BEST_TIMES[channel].time, ...TIMES])].sort();
  return (
    <>
      <ChipGroup>
        {days.map((day) => (
          <Chip
            key={day}
            size="sm"
            label={formatWeekdayShort(day)}
            selected={day === date}
            onPress={() => day !== date && onChange({ date: day, time })}
          />
        ))}
      </ChipGroup>
      <ChipGroup>
        {times.map((candidate) => (
          <Chip
            key={candidate}
            size="sm"
            label={candidate}
            selected={candidate === time}
            onPress={() => candidate !== time && onChange({ date, time: candidate })}
          />
        ))}
      </ChipGroup>
    </>
  );
}

/** In testa al contenuto: quando esce, su quali canali e con che tema. Giorno, ora e canali si cambiano da qui. */
export function SlotSchedule({
  brand,
  slot,
  canMove,
  canChangeChannels,
}: {
  brand: Brand;
  slot: PlanSlot;
  canMove: boolean;
  canChangeChannels: boolean;
}) {
  const toast = useToast();
  const update = useUpdateSlot(brand.id);
  const [editing, setEditing] = useState(false);
  const theme = brand.themes.find((candidate) => candidate.id === slot.themeId) ?? null;
  const channel = slot.channels[0];

  const patch = (changes: SlotPatch, message: string) =>
    update.mutate(
      { slotId: slot.id, patch: changes },
      { onSuccess: () => toast(message), onError: () => toast('Modifica non riuscita. Riprova.') },
    );

  const toggleChannel = (candidate: ChannelId) => {
    if (!slot.channels.includes(candidate)) {
      patch({ channels: [...slot.channels, candidate] }, `${channelName(candidate)} aggiunto.`);
      return;
    }
    if (slot.channels.length === 1) {
      toast('Serve almeno un canale.');
      return;
    }
    patch({ channels: slot.channels.filter((entry) => entry !== candidate) }, `${channelName(candidate)} tolto.`);
  };

  return (
    <View style={styles.stack}>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Text variant="strongSmall">
            {capitalize(formatWeekdayLong(slot.date))} · {slot.time}
          </Text>
          <View style={styles.row}>
            {theme && <Dot color={theme.color} size={8} />}
            <Text variant="caption" numberOfLines={1} style={styles.flex}>
              {theme?.name ?? 'Senza tema'}
            </Text>
          </View>
        </View>
        <View style={styles.marks}>
          {slot.channels.map((candidate) => (
            <ChannelMark key={candidate} channel={candidate} active size={24} />
          ))}
        </View>
      </View>

      {editing && canMove && (
        <View style={styles.section}>
          <Text variant="label">Giorno e ora</Text>
          <DayTimePicker
            date={slot.date}
            time={slot.time}
            channel={channel}
            onChange={(next) =>
              next.date !== slot.date
                ? patch({ date: next.date }, `Spostata a ${formatWeekdayLong(next.date)}.`)
                : patch({ time: next.time }, `Orario: ${next.time}.`)
            }
          />
          <Text variant="caption">
            Per {channelName(channel)} l’orario consigliato è {BEST_TIMES[channel].time}.
          </Text>
        </View>
      )}

      {editing && canChangeChannels && (
        <View style={styles.section}>
          <Text variant="label">Canali</Text>
          <ChipGroup>
            {selectedChannels(brand).map((candidate) => (
              <Chip
                key={candidate}
                size="sm"
                label={channelName(candidate)}
                selected={slot.channels.includes(candidate)}
                onPress={() => toggleChannel(candidate)}
              />
            ))}
          </ChipGroup>
          <Text variant="caption">Lo stesso contenuto esce su tutti i canali scelti, adattato a ognuno.</Text>
        </View>
      )}

      {(canMove || canChangeChannels) && (
        <LinkButton
          label={editing ? 'Fatto' : canChangeChannels ? 'Cambia giorno o canali' : 'Sposta'}
          onPress={() => setEditing(!editing)}
        />
      )}
    </View>
  );
}

/** Le idee salvate libere per un'uscita, prima quelle del tema che il piano chiede. */
export function IdeaPicker({
  brand,
  slot,
  hasDraft,
  onCancel,
  onDone,
}: {
  brand: Brand;
  slot: PlanSlot;
  /** Cambiare idea butta la bozza già scritta: lo si dice prima. */
  hasDraft: boolean;
  onCancel?: () => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const { data: ideas = [] } = useIdeas(brand.id);
  const { data: slots = [] } = usePlan(brand.id);
  const update = useUpdateSlot(brand.id);
  const theme = brand.themes.find((candidate) => candidate.id === slot.themeId) ?? null;

  const used = new Set(
    slots.filter((other) => other.id !== slot.id).map((other) => other.ideaId).filter((id): id is string => id !== null),
  );
  const options = rankIdeasForSlot(slot, ideas, used)
    .filter((option) => option.id !== slot.ideaId)
    .slice(0, 8);

  const assign = (changes: SlotPatch, message: string) => {
    if (update.isPending) return;
    update.mutate(
      { slotId: slot.id, patch: changes },
      {
        onSuccess: () => {
          toast(message);
          onDone();
        },
        onError: () => toast('Modifica non riuscita. Riprova.'),
      },
    );
  };

  return (
    <Panel label={slot.ideaId ? 'Cambia idea' : 'Scegli un’idea'} gap={10}>
      <Text variant="body">
        {theme ? `Il piano chiede un contenuto su «${theme.name}».` : 'Scegli tra le tue idee salvate.'}
      </Text>
      {hasDraft && (
        <Text variant="caption" color={colors.warning}>
          La bozza già scritta si perde.
        </Text>
      )}
      {options.length === 0 ? (
        <Text variant="body">Non ci sono idee salvate libere. Salvane qualcuna dalle Idee.</Text>
      ) : (
        options.map((option) => {
          const optionTheme = brand.themes.find((candidate) => candidate.id === option.themeId);
          return (
            <PressableScale
              key={option.id}
              accessibilityRole="button"
              accessibilityLabel={option.title}
              onPress={() =>
                assign(
                  {
                    ideaId: option.id,
                    themeId: option.themeId ?? slot.themeId,
                    channels: channelsWithIdea({ ...slot, channels: [slot.channels[0]] }, option, selectedChannels(brand)),
                  },
                  'Idea assegnata.',
                )
              }
              style={styles.option}>
              <Text variant="strongSmall" numberOfLines={2}>
                {option.title}
              </Text>
              <View style={styles.row}>
                {optionTheme && <Dot color={optionTheme.color} size={8} />}
                <Text variant="caption" numberOfLines={1} style={styles.flex}>
                  {optionTheme?.name ?? 'Senza tema'}
                  {option.themeId === slot.themeId ? ' · tema giusto' : ''}
                </Text>
              </View>
            </PressableScale>
          );
        })
      )}
      <View style={styles.links}>
        {onCancel && <LinkButton label="Annulla" tone="muted" onPress={onCancel} />}
        {slot.ideaId && (
          <LinkButton label="Lascia senza idea" tone="muted" onPress={() => assign({ ideaId: null }, 'L’uscita torna da riempire.')} />
        )}
        <LinkButton label="Vai alle idee" onPress={() => router.navigate('/ideas')} />
      </View>
    </Panel>
  );
}

/** Rimozione senza finestre di dialogo: il secondo tocco entro pochi secondi conferma. */
export function RemoveFromPlan({
  brand,
  slot,
  direct,
  onRemoved,
}: {
  brand: Brand;
  slot: PlanSlot;
  /** Un contenuto creato direttamente non si perde: torna tra le bozze da programmare. */
  direct: boolean;
  onRemoved: () => void;
}) {
  const toast = useToast();
  const remove = useRemoveSlot(brand.id);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(timer);
  }, [confirming]);

  const onPress = () => {
    if (remove.isPending) return;
    if (!confirming) {
      setConfirming(true);
      return;
    }
    remove.mutate(slot.id, {
      onSuccess: () => {
        toast(direct ? 'Tolto dal piano: lo ritrovi tra le bozze da programmare.' : 'Uscita rimossa dal piano.');
        onRemoved();
      },
      onError: () => toast('Non riesco a rimuoverla dal piano. Riprova.'),
    });
  };

  return (
    <LinkButton
      tone={confirming ? 'accent' : 'muted'}
      label={remove.isPending ? 'Rimuovo…' : confirming ? 'Tocca di nuovo per rimuovere' : 'Rimuovi dal piano'}
      onPress={onPress}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  stack: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  marks: { flexDirection: 'row', gap: 4 },
  section: { gap: 8, borderTopWidth: 1, borderTopColor: colors.borderSubtle, paddingTop: 10 },
  links: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 18 },
  option: {
    gap: 6,
    padding: 12,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceSunken,
  },
});
