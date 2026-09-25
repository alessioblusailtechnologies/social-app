import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AgentStage, Button, LinkButton, Panel, SunkenInput, Text, colors, useToast } from '@/design-system';
import type { BrandVideo } from '@/domain/brand';
import { apiErrorMessage } from '@/services';
import { useProfileJob, useProposeVideoProfile } from '@/services/queries';
import type { VideoProfileRequest } from '@/services/types';

type TextKey = Exclude<keyof BrandVideo, 'shots'>;

const ROWS: { key: TextKey | 'shots'; label: string }[] = [
  { key: 'real', label: 'Si mostra sempre vero' },
  { key: 'generated', label: 'Si può generare' },
  { key: 'shots', label: 'Riprese da chiederti' },
  { key: 'look', label: 'Come si muove' },
  { key: 'sound', label: 'Come suona' },
];

/**
 * Come si racconta il brand in video: nasce con la linea, si corregge a mano come la scheda voce, si rifà da capo.
 * Chi fa la regia di ogni video parte da qui.
 */
export function VideoProfilePanel({
  value,
  onChange,
  request,
}: {
  value: BrandVideo | null | undefined;
  onChange: (video: BrandVideo) => void;
  /** Da cosa si rifà: chi è il brand adesso, anche con le modifiche non ancora salvate. */
  request: () => VideoProfileRequest;
}) {
  const toast = useToast();
  const propose = useProposeVideoProfile();
  const [editing, setEditing] = useState(false);
  // Rifarlo richiede un minuto: se si esce e si rientra, ci si rimette a guardare.
  const resumed = useProfileJob<BrandVideo>('video-profile', onChange, !propose.isPending);
  const working = propose.isPending || resumed.resuming;
  const steps = propose.isPending ? propose.steps : resumed.steps;

  const write = () => {
    setEditing(false);
    propose.mutate(request(), {
      onSuccess: onChange,
      onError: (error) => toast(apiErrorMessage(error, 'Non sono riuscito a scrivere il profilo video. Riprova.')),
    });
  };

  const action = value && !working ? <LinkButton label={editing ? 'Fatto' : 'Correggi'} onPress={() => setEditing(!editing)} /> : undefined;

  return (
    <Panel label="Come si racconta in video" action={action} gap={12}>
      {working ? (
        <AgentStage steps={steps} aspect={9 / 16} />
      ) : value ? (
        ROWS.map(({ key, label }) => {
          const text = key === 'shots' ? value.shots.join('\n') : value[key];
          return (
            <View key={key} style={styles.row}>
              <Text variant="label">{label}</Text>
              {editing ? (
                <SunkenInput
                  multiline
                  minHeight={key === 'shots' ? 120 : 64}
                  value={text}
                  onChangeText={(next) =>
                    onChange(
                      key === 'shots'
                        ? { ...value, shots: next.split('\n').map((shot) => shot.replace(/^[-•]\s*/, '')) }
                        : { ...value, [key]: next },
                    )
                  }
                  accessibilityLabel={label}
                />
              ) : key === 'shots' ? (
                value.shots
                  .filter((shot) => shot.trim())
                  .map((shot, index) => (
                    <Text key={index} variant="body" color={colors.textTitle}>
                      · {shot}
                    </Text>
                  ))
              ) : (
                <Text variant="body" color={colors.textTitle}>
                  {text}
                </Text>
              )}
            </View>
          );
        })
      ) : (
        <Text variant="caption">
          Cosa si mostra sempre vero, cosa si può generare, le riprese da chiederti, il look e la musica dei tuoi video. Lo scrivo con
          la linea delle card, o al primo video.
        </Text>
      )}
      {editing && value ? <Text variant="caption">Una ripresa per riga.</Text> : null}
      {!working && (
        <Button size="sm" variant="secondary" onPress={write}>
          {value ? 'Rifai il profilo video' : 'Scrivi il profilo video'}
        </Button>
      )}
    </Panel>
  );
}

const styles = StyleSheet.create({
  row: { gap: 4 },
});
