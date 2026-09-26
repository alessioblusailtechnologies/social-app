import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AgentStage, Button, ImageViewer, LinkButton, SunkenInput, Text, colors, radii, useToast } from '@/design-system';
import { COVER_TITLE_LIMIT, type Content } from '@shared/domain/content';
import { apiErrorMessage } from '@/services';
import { VIDEO_COVER_STEPS } from '@shared/services/ai-steps';
import { useMakeCover, useRetitleCover } from '@/services/queries';

const WIDTH = 116;

/**
 * La copertina del reel, nel pannello del montaggio: com'è intera (la scheda Reels) e come la ritaglia Instagram nella
 * griglia del profilo (3:4, al centro). Il titolo si cambia a mano e si ricompone senza AI; «Rifai la copertina»
 * riparte dal montaggio.
 */
export function VideoCoverRow({ content, disabled }: { content: Content; disabled: boolean }) {
  const toast = useToast();
  const make = useMakeCover();
  const retitle = useRetitleCover();
  const cover = content.visual.cover ?? null;
  const [title, setTitle] = useState<string | null>(null);
  const [viewer, setViewer] = useState(false);
  const typed = title ?? cover?.title ?? '';
  const changed = cover !== null && typed.trim() !== cover.title && typed.trim().length > 0;

  const remake = () =>
    make.mutate(content.id, {
      onSuccess: () => {
        setTitle(null);
        toast('Copertina pronta.');
      },
      onError: (error) => toast(apiErrorMessage(error, 'Non sono riuscito a fare la copertina. Riprova.')),
    });

  if (make.isPending) {
    return (
      <View style={styles.column}>
        <Text variant="label">Copertina</Text>
        <AgentStage steps={make.steps} waiting={VIDEO_COVER_STEPS.thinking} aspect={9 / 16} />
      </View>
    );
  }

  if (!cover) {
    return (
      <View style={styles.column}>
        <Text variant="label">Copertina</Text>
        <Text variant="caption">
          {content.visual.cut
            ? 'La faccio da un fotogramma del montaggio, rifinito e composto nella grafica del brand.'
            : 'Nasce col montaggio: da un fotogramma vero, rifinito e composto nella grafica del brand.'}
        </Text>
        {content.visual.cut && !disabled ? <LinkButton label="Fai la copertina" onPress={remake} /> : null}
      </View>
    );
  }

  return (
    <View style={styles.column}>
      <Text variant="label">Copertina</Text>
      <View style={styles.previews}>
        <Pressable accessibilityRole="button" accessibilityLabel="Apri la copertina a tutto schermo" onPress={() => setViewer(true)} style={styles.preview}>
          <Image source={{ uri: cover.file.url }} style={styles.full} contentFit="cover" />
          <Text variant="caption" align="center">
            Nei Reels
          </Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Apri la copertina a tutto schermo" onPress={() => setViewer(true)} style={styles.preview}>
          <Image source={{ uri: cover.file.url }} style={styles.grid} contentFit="cover" contentPosition="center" />
          <Text variant="caption" align="center">
            Nella griglia
          </Text>
        </Pressable>
      </View>
      {!disabled && (
        <>
          <SunkenInput
            value={typed}
            onChangeText={setTitle}
            maxLength={COVER_TITLE_LIMIT}
            placeholder="Il titolo della copertina"
            accessibilityLabel="Il titolo della copertina"
          />
          <View style={styles.row}>
            {changed ? (
              <Button
                size="sm"
                busy={retitle.isPending}
                onPress={() =>
                  retitle.mutate(
                    { contentId: content.id, title: typed.trim(), kicker: cover.kicker },
                    {
                      onSuccess: () => {
                        setTitle(null);
                        toast('Titolo aggiornato.');
                      },
                      onError: (error) => toast(apiErrorMessage(error, 'Non sono riuscito a ricomporre la copertina. Riprova.')),
                    },
                  )
                }>
                Aggiorna il titolo
              </Button>
            ) : null}
            <LinkButton label="Rifai la copertina" onPress={remake} />
          </View>
        </>
      )}
      <ImageViewer
        items={[{ key: cover.file.path ?? cover.file.url, uri: cover.file.url, aspectRatio: 9 / 16, label: 'La copertina del reel' }]}
        index={viewer ? 0 : null}
        onClose={() => setViewer(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: 8 },
  previews: { flexDirection: 'row', gap: 12 },
  preview: { gap: 4 },
  full: { width: WIDTH, height: Math.round((WIDTH * 16) / 9), borderRadius: radii.md, backgroundColor: colors.surfaceSunken },
  grid: { width: WIDTH, height: Math.round((WIDTH * 4) / 3), borderRadius: radii.md, backgroundColor: colors.surfaceSunken },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14 },
});
