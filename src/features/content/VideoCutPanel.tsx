import { useVideoPlayer, VideoView } from 'expo-video';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Badge, Button, Panel, StepList, Text, colors, radii, useToast } from '@/design-system';
import type { Brand } from '@/domain/brand';
import { cutKey, type Content } from '@/domain/content';
import { VIDEO_CUT_STEPS } from '@/services/ai-steps';
import { useCutVideo } from '@/services/queries';
import type { AiStep } from '@/services/types';

import { VideoMusicRow } from './VideoMusicRow';

const PLAYER_WIDTH = 220;

/**
 * Il montaggio nel Video Studio: si monta subito, anche senza girati. Dove manca il materiale c'è un cartello che
 * dice cosa ci andrà, così ritmo e storia si vedono prima di girare. Se la regia cambia, il montaggio resta e va
 * rifatto.
 */
export function VideoCutPanel({
  brand,
  content,
  locked,
  cuttingSteps,
}: {
  brand: Brand;
  content: Content;
  locked: boolean;
  /** I passi di un montaggio ripreso da prima, se ce n'è uno in corso. */
  cuttingSteps?: AiStep[];
}) {
  const toast = useToast();
  const cutVideo = useCutVideo();
  const cutting = cutVideo.isPending || cuttingSteps !== undefined;
  const cut = content.visual.cut ?? null;
  const stale = cut !== null && cut.from !== cutKey(content.visual);

  const start = () =>
    cutVideo.mutate(content.id, { onError: () => toast('Non sono riuscito a montare il video. Riprova.') });

  if (cutting) {
    return (
      <Panel label="Montaggio" gap={10}>
        <StepList steps={cuttingSteps ?? cutVideo.steps} waiting={VIDEO_CUT_STEPS.thinking} />
        <Text variant="caption">Ci vuole qualche minuto: puoi uscire, il montaggio va avanti.</Text>
      </Panel>
    );
  }

  return (
    <Panel
      label="Montaggio"
      action={
        stale ? (
          <Badge tone="yellow" size="sm">
            La regia è cambiata
          </Badge>
        ) : undefined
      }
      gap={12}>
      {cut ? (
        <>
          <View style={styles.center}>
            {cut.file.url ? (
              // Un file nuovo per ogni montaggio: col percorso come chiave il lettore riparte solo quando cambia davvero,
              // non ogni volta che l'indirizzo firmato si rinnova.
              <CutPlayer key={cut.file.path ?? cut.file.url} url={cut.file.url} />
            ) : (
              <View style={[styles.player, styles.empty]}>
                <Text variant="caption" align="center">
                  Nella demo il montaggio non si vede: col server acceso qui c’è il video.
                </Text>
              </View>
            )}
          </View>
          <Text variant="caption">
            {cut.seconds} secondi.{' '}
            {cut.placeholders === 0
              ? 'Tutte le scene hanno la loro immagine.'
              : `${cut.placeholders === 1 ? 'Una scena ha' : `${cut.placeholders} scene hanno`} ancora il cartello: dice cosa ci andrà, girato o generato.`}
          </Text>
        </>
      ) : (
        <Text variant="caption">
          Monto la regia così com’è: grafica e testi a schermo nei colori del brand, la musica del brand sotto, e un cartello dove manca il materiale.
          Vedi subito ritmo e storia, prima di girare.
        </Text>
      )}
      <VideoMusicRow brand={brand} content={content} disabled={locked && content.status !== 'approved'} />
      {/* Si rimonta anche a contenuto approvato: arrivano i girati, e il video si completa. */}
      {(!locked || content.status === 'approved') && (
        <Button size="sm" variant={cut && !stale ? 'secondary' : 'primary'} onPress={start}>
          {cut ? 'Rimonta il video' : 'Monta il video'}
        </Button>
      )}
    </Panel>
  );
}

function CutPlayer({ url }: { url: string }) {
  // Il primo indirizzo basta: quelli rinnovati dopo puntano allo stesso file.
  const [source] = useState(url);
  const player = useVideoPlayer(source, (created) => {
    created.loop = true;
  });
  return <VideoView player={player} style={styles.player} nativeControls contentFit="contain" />;
}

const styles = StyleSheet.create({
  center: { alignItems: 'center' },
  player: {
    width: PLAYER_WIDTH,
    height: (PLAYER_WIDTH * 16) / 9,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceSunken,
  },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 16 },
});
