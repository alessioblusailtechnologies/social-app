import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  Badge,
  Button,
  Chip,
  ChipGroup,
  Dot,
  IconButton,
  LinkButton,
  Panel,
  PressableScale,
  ScreenFooter,
  ScreenTitle,
  Text,
  TopBar,
  colors,
  radii,
  screenStyles,
  useToast,
} from '@/design-system';
import type { Brand, ChannelId } from '@/domain/brand';
import { channelName } from '@/domain/catalog';
import {
  BEST_TIMES,
  channelsWithIdea,
  rankIdeasForSlot,
  selectedChannels,
  SLOT_STATUS_LABELS,
  type PlanSlot,
} from '@/domain/plan';
import { addDays, formatWeekdayLong, formatWeekdayShort, today } from '@/lib/dates';
import { useIdeas, usePlan, useRemoveSlot, useUpdateSlot } from '@/services/queries';
import type { SlotPatch } from '@/services/types';

import { SLOT_TONES } from './PlanParts';

const TIMES = ['08:30', '12:30', '13:00', '18:30', '19:00'];

export function SlotDetailScreen({ brand, slot }: { brand: Brand; slot: PlanSlot }) {
  const router = useRouter();
  const toast = useToast();
  const { data: ideas = [] } = useIdeas(brand.id);
  const { data: slots = [] } = usePlan(brand.id);
  const update = useUpdateSlot(brand.id);
  const remove = useRemoveSlot(brand.id);
  const [picking, setPicking] = useState(false);
  const [moving, setMoving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  // Conferma della rimozione senza finestre di dialogo: il secondo tocco entro pochi secondi.
  useEffect(() => {
    if (!confirmRemove) return;
    const timer = setTimeout(() => setConfirmRemove(false), 4000);
    return () => clearTimeout(timer);
  }, [confirmRemove]);

  const idea = ideas.find((candidate) => candidate.id === slot.ideaId) ?? null;
  const theme = brand.themes.find((candidate) => candidate.id === slot.themeId) ?? null;
  const allowed = selectedChannels(brand);
  const published = slot.status === 'published';
  const title = formatWeekdayLong(slot.date);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/plan'));

  const patch = (changes: SlotPatch, message: string) =>
    update.mutate(
      { slotId: slot.id, patch: changes },
      { onSuccess: () => toast(message), onError: () => toast('Modifica non riuscita. Riprova.') },
    );

  const used = new Set(
    slots.filter((other) => other.id !== slot.id).map((other) => other.ideaId).filter((id): id is string => id !== null),
  );
  const options = rankIdeasForSlot(slot, ideas, used).slice(0, 8);

  const toggleChannel = (channel: ChannelId) => {
    if (slot.channels.includes(channel)) {
      if (slot.channels.length === 1) {
        toast('Serve almeno un canale.');
        return;
      }
      patch({ channels: slot.channels.filter((entry) => entry !== channel) }, `${channelName(channel)} tolto.`);
    } else {
      patch({ channels: [...slot.channels, channel] }, `${channelName(channel)} aggiunto.`);
    }
  };

  const removeSlot = () => {
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    remove.mutate(slot.id, {
      onSuccess: () => {
        toast('Uscita rimossa dal piano.');
        close();
      },
      onError: () => toast('Non riesco a rimuovere l’uscita. Riprova.'),
    });
  };

  const days = Array.from({ length: 14 }, (_, i) => addDays(today(), i + 1));
  const times = [...new Set([slot.time, BEST_TIMES[slot.channels[0]].time, ...TIMES])].sort();

  return (
    <View style={screenStyles.screen}>
      <TopBar
        left={<IconButton icon={ChevronLeft} accessibilityLabel="Torna al piano" onPress={close} />}
        title="Uscita"
        right={
          <Badge tone={SLOT_TONES[slot.status]} size="sm">
            {SLOT_STATUS_LABELS[slot.status]}
          </Badge>
        }
      />
      <ScrollView contentContainerStyle={screenStyles.content}>
        <ScreenTitle
          title={`${title.charAt(0).toUpperCase()}${title.slice(1)} · ${slot.time}`}
          subtitle={theme ? `Il piano chiede un contenuto su «${theme.name}».` : undefined}
        />

        <Panel label="Contenuto" gap={10}>
          {idea && !picking && (
            <>
              <Text variant="heading">{idea.title}</Text>
              <Text variant="label">{idea.angleLabel}</Text>
              <Text variant="body" color={colors.textTitle} style={styles.lineHeight}>
                {idea.angle}
              </Text>
              <View style={styles.links}>
                <LinkButton
                  label="Apri l’idea"
                  onPress={() => router.push({ pathname: '/idea/[id]', params: { id: idea.id } })}
                />
                {!published && <LinkButton label="Cambia idea" onPress={() => setPicking(true)} />}
                {!published && (
                  <LinkButton
                    label="Togli l’idea"
                    tone="muted"
                    onPress={() => patch({ ideaId: null }, 'L’uscita torna da riempire.')}
                  />
                )}
              </View>
            </>
          )}
          {!idea && !picking && (
            <>
              <Text variant="body">Nessuna idea per questa uscita.</Text>
              <Button block onPress={() => setPicking(true)}>
                Scegli un’idea
              </Button>
            </>
          )}
          {picking && (
            <>
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
                      onPress={() => {
                        patch(
                          {
                            ideaId: option.id,
                            themeId: option.themeId ?? slot.themeId,
                            channels: channelsWithIdea({ ...slot, channels: [slot.channels[0]] }, option, allowed),
                          },
                          'Idea assegnata all’uscita.',
                        );
                        setPicking(false);
                      }}
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
                <LinkButton label="Annulla" tone="muted" onPress={() => setPicking(false)} />
                <LinkButton label="Vai alle idee" onPress={() => router.navigate('/ideas')} />
              </View>
            </>
          )}
        </Panel>

        {!published && (
          <Panel
            label="Quando"
            action={<LinkButton label={moving ? 'Fatto' : 'Sposta'} onPress={() => setMoving(!moving)} />}
            gap={10}>
            <Text variant="strongSmall">
              {title} alle {slot.time}
            </Text>
            {moving && (
              <>
                <ChipGroup>
                  {days.map((day) => (
                    <Chip
                      key={day}
                      size="sm"
                      label={formatWeekdayShort(day)}
                      selected={day === slot.date}
                      onPress={() => patch({ date: day }, `Spostata a ${formatWeekdayLong(day)}.`)}
                    />
                  ))}
                </ChipGroup>
                <ChipGroup>
                  {times.map((time) => (
                    <Chip
                      key={time}
                      size="sm"
                      label={time}
                      selected={time === slot.time}
                      onPress={() => patch({ time }, `Orario: ${time}.`)}
                    />
                  ))}
                </ChipGroup>
                <Text variant="caption">
                  Per {channelName(slot.channels[0])} l’orario consigliato è {BEST_TIMES[slot.channels[0]].time}.
                </Text>
              </>
            )}
          </Panel>
        )}

        <Panel label="Canali" gap={10}>
          <ChipGroup>
            {allowed.map((channel) => (
              <Chip
                key={channel}
                label={channelName(channel)}
                selected={slot.channels.includes(channel)}
                onPress={published ? undefined : () => toggleChannel(channel)}
              />
            ))}
          </ChipGroup>
          <Text variant="caption">Lo stesso contenuto esce su tutti i canali scelti, adattato a ognuno.</Text>
        </Panel>
      </ScrollView>

      <ScreenFooter>
        <Button
          size="lg"
          block
          disabled={!idea}
          onDisabledPress={() => toast('Scegli prima un’idea per questa uscita.')}
          onPress={() => router.push({ pathname: '/content/[slotId]', params: { slotId: slot.id } })}>
          Apri il contenuto
        </Button>
        {!published && (
          <Button variant={confirmRemove ? 'secondary' : 'ghost'} block busy={remove.isPending} onPress={removeSlot}>
            {confirmRemove ? 'Tocca di nuovo per rimuovere' : 'Rimuovi dal piano'}
          </Button>
        )}
      </ScreenFooter>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lineHeight: { lineHeight: 19 },
  links: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 18 },
  option: {
    gap: 6,
    padding: 12,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceSunken,
  },
});
