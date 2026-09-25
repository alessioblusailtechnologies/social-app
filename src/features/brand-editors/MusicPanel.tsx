import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Pause, Play } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, IconButton, Panel, StepList, Text, colors, useToast } from '@/design-system';
import type { Brand, BrandTrack } from '@/domain/brand';
import { apiErrorMessage } from '@/services';
import { MUSIC_STEPS } from '@/services/ai-steps';
import { useProfileJob, useRemakeMusic } from '@/services/queries';

/**
 * La musica del brand: le poche tracce strumentali che vanno sotto i suoi video. Nasce al primo montaggio; qui si
 * ascolta e si rifà. Si rifà solo nel Profilo, dove il brand esiste già: la libreria si salva da sola.
 */
export function MusicPanel({
  brandId,
  value,
  onChange,
}: {
  brandId: string;
  value: BrandTrack[] | undefined;
  onChange: (music: BrandTrack[]) => void;
}) {
  const toast = useToast();
  const remake = useRemakeMusic();
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [current, setCurrent] = useState<string | null>(null);
  const tracks = value ?? [];

  const apply = (brand: Brand) => onChange(brand.visual.music ?? []);
  // Comporre richiede qualche minuto: se si esce e si rientra, ci si rimette a guardare.
  const resumed = useProfileJob<Brand>('brand-music', apply, !remake.isPending);
  const working = remake.isPending || resumed.resuming;

  const toggle = (track: BrandTrack) => {
    if (current === track.id && status.playing) {
      player.pause();
      return;
    }
    if (current !== track.id) {
      player.replace({ uri: track.file.url });
      setCurrent(track.id);
    }
    player.play();
  };

  const start = () => {
    player.pause();
    remake.mutate(brandId, {
      onSuccess: (brand) => {
        apply(brand);
        toast('Musica pronta.');
      },
      onError: (error) => toast(apiErrorMessage(error, 'Non sono riuscito a comporre la musica. Riprova.')),
    });
  };

  return (
    <Panel label="La musica del brand" gap={12}>
      {working ? (
        <StepList steps={remake.isPending ? remake.steps : resumed.steps} waiting={MUSIC_STEPS.plan} />
      ) : tracks.length > 0 ? (
        tracks.map((track) => {
          const playing = current === track.id && status.playing;
          return (
            <View key={track.id} style={styles.row}>
              <IconButton
                icon={playing ? Pause : Play}
                size={36}
                iconSize={16}
                accessibilityLabel={playing ? `Metti in pausa ${track.mood}` : `Ascolta ${track.mood}`}
                disabled={!track.file.url}
                onPress={() => toggle(track)}
              />
              <View style={styles.flex}>
                <Text variant="strongSmall">{track.mood}</Text>
                <Text variant="caption">
                  {track.bpm} bpm · {track.seconds} s
                </Text>
              </View>
            </View>
          );
        })
      ) : (
        <Text variant="caption">
          Poche tracce strumentali, dal suono del tuo profilo video: ogni video ne usa una, così suoni sempre riconoscibile. Le
          compongo al primo montaggio, o adesso.
        </Text>
      )}
      {tracks.length > 0 && !working && !tracks.some((track) => track.file.url) ? (
        <Text variant="caption" color={colors.textTitle}>
          Nella demo le tracce non si ascoltano: col server acceso sì.
        </Text>
      ) : null}
      {!working && (
        <Button size="sm" variant="secondary" onPress={start}>
          {tracks.length > 0 ? 'Rifai la musica' : 'Componi la musica'}
        </Button>
      )}
    </Panel>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1, minWidth: 0 },
});
