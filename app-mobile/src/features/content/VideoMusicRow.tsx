import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Pause, Play } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { IconButton, LinkButton, RadioMark, Sheet, Text, colors, useToast } from '@/design-system';
import type { Brand, BrandTrack } from '@shared/domain/brand';
import type { Content } from '@shared/domain/content';
import { apiErrorMessage } from '@/services';
import { useSetMusic } from '@/services/queries';

/** Cosa si può scegliere: una traccia del brand, nessuna, o lasciarla a chi monta. */
type Choice = string | null | 'auto';

/**
 * La musica del video, nel pannello del montaggio: quale traccia suona (scelta dall'utente o da chi monta), da
 * ascoltare da sola, e da cambiare tra quelle del brand. Cambiarla non costa generazioni: si rimonta.
 */
export function VideoMusicRow({ brand, content, disabled }: { brand: Brand; content: Content; disabled: boolean }) {
  const toast = useToast();
  const setMusic = useSetMusic();
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [playing, setPlaying] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const library = brand.visual.music ?? [];
  const choice = content.visual.musicId;
  const cut = content.visual.cut ?? null;
  const trackOf = (id: string | null | undefined) => library.find((track) => track.id === id) ?? null;
  // Quella scelta dall'utente; senza scelta, quella che ha usato chi ha montato.
  const shown = typeof choice === 'string' ? trackOf(choice) : choice === undefined ? trackOf(cut?.trackId) : null;

  const describe =
    choice === null
      ? 'Senza musica'
      : typeof choice === 'string'
        ? shown
          ? `${shown.mood} · scelta da te`
          : 'La traccia scelta non c’è più: la scelgo io'
        : shown
          ? `${shown.mood} · scelta da me`
          : library.length > 0
            ? 'La scelgo io tra le tracce del brand'
            : cut
              ? // Montato senza tracce: la composizione non è riuscita, e il video è uscito muto.
                'Senza musica: non sono riuscito a comporla. Rimonta per riprovare, o componila dal Profilo'
              : 'La compongo al primo montaggio, dal suono del brand';

  const toggle = (track: BrandTrack) => {
    if (playing === track.id && status.playing) {
      player.pause();
      return;
    }
    if (playing !== track.id) {
      player.replace({ uri: track.file.url });
      setPlaying(track.id);
    }
    player.play();
  };

  const pick = (next: Choice) => {
    setOpen(false);
    player.pause();
    setMusic.mutate(
      { contentId: content.id, musicId: next },
      {
        onSuccess: () => cut && toast('Musica cambiata: rimonta il video per sentirla.'),
        onError: (error) => toast(apiErrorMessage(error, 'Non sono riuscito a cambiare la musica. Riprova.')),
      },
    );
  };

  const playButton = (track: BrandTrack) => {
    const on = playing === track.id && status.playing;
    return (
      <IconButton
        icon={on ? Pause : Play}
        size={32}
        iconSize={14}
        accessibilityLabel={on ? `Metti in pausa ${track.mood}` : `Ascolta ${track.mood}`}
        disabled={!track.file.url}
        onPress={() => toggle(track)}
      />
    );
  };

  const option = (key: string, value: Choice, label: string, detail: string, track: BrandTrack | null) => {
    const selected = value === 'auto' ? choice === undefined : choice === value;
    return (
      <View key={key} style={styles.option}>
        <Pressable accessibilityRole="radio" accessibilityState={{ selected }} style={styles.optionMain} onPress={() => pick(value)}>
          <RadioMark selected={selected} />
          <View style={styles.flex}>
            <Text variant="strongSmall">{label}</Text>
            <Text variant="caption">{detail}</Text>
          </View>
        </Pressable>
        {track ? playButton(track) : null}
      </View>
    );
  };

  return (
    <View style={styles.row}>
      {shown ? playButton(shown) : null}
      <View style={styles.flex}>
        <Text variant="label">Musica</Text>
        <Text variant="body" color={colors.textTitle}>
          {describe}
        </Text>
      </View>
      {!disabled && <LinkButton label="Cambia" onPress={() => setOpen(true)} />}

      <Sheet
        visible={open}
        onClose={() => {
          player.pause();
          setOpen(false);
        }}
        title="La musica del video"
        hint={
          library.length > 0
            ? 'Le tracce del brand: ascoltale e scegli. Poi rimonta il video.'
            : 'Il brand non ha ancora le sue tracce: le compongo al primo montaggio, o dal Profilo.'
        }>
        {option('auto', 'auto', 'Scegli tu', 'Quella che va meglio col video, tra le tracce del brand', null)}
        {library.map((track) => option(track.id, track.id, track.mood, `${track.bpm} bpm · ${track.seconds} s`, track))}
        {option('none', null, 'Senza musica', 'Solo le immagini e i testi', null)}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1, minWidth: 0 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  optionMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
});
