import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { StyleSheet, View } from 'react-native';

import { Badge, LinkButton, StepList, Text, colors, useToast } from '@/design-system';
import { FOOTAGE_TYPES, footageKind, type Content, type VideoScene } from '@/domain/content';
import { apiErrorMessage } from '@/services';
import { BROLL_STEPS, VIDEO_SCENE_STEPS } from '@/services/ai-steps';
import { useLockScene, useMakeBroll, useRemoveFootage, useReplaceScene, useUploadFootage } from '@/services/queries';

const EXTENSION_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

/** Il tipo del file: quello che dice il selettore, o quello del nome quando non lo dice. */
function mimeTypeOf(asset: ImagePicker.ImagePickerAsset): string {
  if (asset.mimeType) return asset.mimeType;
  const extension = (asset.fileName ?? asset.uri).split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_TYPES[extension] ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');
}

/**
 * Il materiale vero di una scena, sotto la sua descrizione: carica il girato (o la foto di una foto viva), cambialo,
 * toglilo; e per una scena da girare, «Non posso girarla». Il materiale si carica anche a contenuto approvato (si gira
 * dopo aver deciso cosa girare); cambiare la scena no.
 */
export function SceneMaterial({ content, scene, index, locked }: { content: Content; scene: VideoScene; index: number; locked: boolean }) {
  const toast = useToast();
  const upload = useUploadFootage();
  const remove = useRemoveFootage();
  const replace = useReplaceScene();
  const kind = footageKind(scene.source);
  const pending = upload.isPending && upload.variables?.index === index;
  const replacing = replace.isPending && replace.variables?.index === index;

  if (replacing) return <StepList steps={replace.steps} waiting={VIDEO_SCENE_STEPS.thinking} />;
  if (scene.source === 'broll') return <BrollControls content={content} scene={scene} index={index} />;
  if (!kind) return null;

  const pick = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: [kind === 'video' ? 'videos' : 'images'],
      quality: 0.8,
      exif: false,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    const mimeType = mimeTypeOf(asset);
    const accepted = FOOTAGE_TYPES[kind];
    if (!accepted.mimeTypes.includes(mimeType)) {
      toast(kind === 'video' ? 'Il girato deve essere un MP4 o un MOV.' : 'La foto deve essere un PNG, un JPEG o un WebP.');
      return;
    }
    // Quanto pesa, se il selettore non lo dice: lo si chiede al file.
    const bytes = asset.fileSize ?? (await (await fetch(asset.uri)).blob()).size;
    if (bytes > accepted.maxBytes) {
      toast(`Il file è troppo pesante: al massimo ${Math.round(accepted.maxBytes / 1024 / 1024)} MB.`);
      return;
    }
    upload.mutate(
      { contentId: content.id, index, file: { uri: asset.uri, mimeType, bytes } },
      {
        onSuccess: () => toast(kind === 'video' ? 'Girato caricato: rimonta il video per vederlo.' : 'Foto caricata: rimonta il video per vederla.'),
        onError: (error) => toast(apiErrorMessage(error, 'Il caricamento non è riuscito. Riprova.')),
      },
    );
  };

  const label = kind === 'video' ? 'girato' : 'foto';
  const has = Boolean(scene.footage);

  return (
    <View style={styles.column}>
      {pending ? (
        <Text variant="caption" color={colors.textTitle}>
          Carico {kind === 'video' ? 'il girato' : 'la foto'}…
        </Text>
      ) : has ? (
        <View style={styles.row}>
          <Badge tone="mint" size="sm">
            {kind === 'video' ? 'Girato caricato' : 'Foto caricata'}
          </Badge>
        </View>
      ) : null}
      {!pending && (
        <View style={styles.row}>
          <LinkButton label={has ? `Cambia ${label}` : kind === 'video' ? 'Carica il girato' : 'Carica la foto'} onPress={pick} />
          {has && (
            <LinkButton
              label="Togli"
              onPress={() =>
                remove.mutate(
                  { contentId: content.id, index },
                  { onError: (error) => toast(apiErrorMessage(error, 'Non sono riuscito a toglierlo. Riprova.')) },
                )
              }
            />
          )}
          {scene.source === 'shoot' && !has && !locked && (
            <LinkButton
              label="Non posso girarla"
              onPress={() =>
                replace.mutate(
                  { contentId: content.id, index },
                  { onError: (error) => toast(apiErrorMessage(error, 'Non sono riuscito a rifare la scena. Riprova.')) },
                )
              }
            />
          )}
        </View>
      )}
    </View>
  );
}

/**
 * Il b-roll di una scena, in due gesti: il fotogramma, che costa poco e si guarda prima; poi la clip, che è dove si
 * spende. Rifare il fotogramma butta la clip. Il lucchetto ferma una scena che va bene.
 */
function BrollControls({ content, scene, index }: { content: Content; scene: VideoScene; index: number }) {
  const toast = useToast();
  const make = useMakeBroll();
  const lock = useLockScene();
  const working = make.isPending && make.variables?.index === index;
  const frame = scene.frame?.url ? scene.frame : null;

  const run = (step: 'frame' | 'clip') =>
    make.mutate(
      { contentId: content.id, index, step },
      {
        onSuccess: () => toast(step === 'frame' ? 'Fotogramma pronto: se va bene, anima la scena.' : 'Clip pronta: rimonta il video per vederla.'),
        onError: (error) => toast(apiErrorMessage(error, 'Non ci sono riuscito. Riprova.')),
      },
    );
  const setLock = (locked: boolean) =>
    lock.mutate(
      { contentId: content.id, index, locked },
      { onError: (error) => toast(apiErrorMessage(error, 'Non sono riuscito a cambiare il lucchetto. Riprova.')) },
    );

  if (working) return <StepList steps={make.steps} waiting={make.variables?.step === 'frame' ? BROLL_STEPS.frame : BROLL_STEPS.clip} />;

  return (
    <View style={styles.column}>
      {frame || scene.clip ? (
        <View style={styles.brollRow}>
          {frame ? <Image source={{ uri: frame.url }} style={styles.frame} contentFit="cover" /> : null}
          <View style={styles.flex}>
            {scene.locked ? (
              <Badge tone="navy" size="sm">
                Bloccata
              </Badge>
            ) : scene.clip ? (
              <Badge tone="mint" size="sm">
                Clip pronta
              </Badge>
            ) : (
              <Text variant="caption">Se il fotogramma va bene, animalo: la clip parte da qui.</Text>
            )}
          </View>
        </View>
      ) : null}
      <View style={styles.row}>
        {scene.locked ? (
          <LinkButton label="Sblocca" onPress={() => setLock(false)} />
        ) : (
          <>
            {!scene.frame ? <LinkButton label="Crea il fotogramma" onPress={() => run('frame')} /> : null}
            {scene.frame && !scene.clip ? <LinkButton label="Anima la scena" onPress={() => run('clip')} /> : null}
            {scene.clip ? <LinkButton label="Un’altra ripresa" onPress={() => run('clip')} /> : null}
            {scene.frame ? <LinkButton label="Rifai il fotogramma" onPress={() => run('frame')} /> : null}
            {scene.clip ? <LinkButton label="Blocca" onPress={() => setLock(true)} /> : null}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  brollRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  frame: { width: 54, height: 96, borderRadius: 8, backgroundColor: colors.surfaceSunken },
  flex: { flex: 1, minWidth: 0 },
  column: { gap: 6, paddingTop: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14 },
});
