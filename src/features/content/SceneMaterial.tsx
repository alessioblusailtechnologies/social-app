import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Camera, ImageIcon, Play, Sparkles, Type } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AgentStage, Badge, ImageViewer, LinkButton, Text, colors, palette, radii, useToast, type ViewerItem } from '@/design-system';
import { FOOTAGE_TYPES, SCENE_SOURCE_LABELS, footageTooHeavy, footageKind, readScene, type Content, type VideoScene } from '@/domain/content';
import { apiErrorMessage } from '@/services';
import { BROLL_STEPS, VIDEO_SCENE_STEPS } from '@/services/ai-steps';
import { useLockScene, useMakeBroll, useRemoveFootage, useReplaceScene, useUploadFootage } from '@/services/queries';

import { VideoStudio } from './ContentParts';

/** La card di anteprima di una scena: verticale, come il video. */
const PREVIEW_WIDTH = 180;
const PREVIEW_HEIGHT = Math.round((PREVIEW_WIDTH * 16) / 9);

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

interface SceneMedia {
  kind: 'video' | 'image';
  uri: string;
  label: string;
}

/** Il materiale che si vede di una scena: la clip del b-roll (o il suo fotogramma), il girato, la foto. */
function sceneMedia(scene: VideoScene): SceneMedia | null {
  if (scene.source === 'broll') {
    if (scene.clip?.url) return { kind: 'video', uri: scene.clip.url, label: 'La clip' };
    if (scene.frame?.url) return { kind: 'image', uri: scene.frame.url, label: 'Il fotogramma' };
    return null;
  }
  if (!scene.footage?.url) return null;
  return scene.source === 'shoot'
    ? { kind: 'video', uri: scene.footage.url, label: 'Il girato' }
    : { kind: 'image', uri: scene.footage.url, label: 'La foto' };
}

/**
 * Le scene del Video Studio col loro materiale: ogni scena numerata ha la sua card di anteprima, e un tocco la apre a
 * tutto schermo, dove si scorre fra il materiale di tutte le scene.
 */
export function VideoScenes({ content, locked }: { content: Content; locked: boolean }) {
  const [viewer, setViewer] = useState<number | null>(null);
  const scenes = content.visual.scenes.map(readScene);
  const gallery = scenes.flatMap((scene, index) => {
    const media = sceneMedia(scene);
    return media ? [{ index, media }] : [];
  });
  const items: ViewerItem[] = gallery.map(({ index, media }) => ({
    key: `${index}-${media.uri}`,
    ...(media.kind === 'video' ? { video: media.uri } : { uri: media.uri }),
    aspectRatio: 9 / 16,
    label: `Scena ${index + 1} · ${media.label}`,
  }));

  return (
    <>
      <VideoStudio
        visual={content.visual}
        renderScene={(scene, index) => (
          <SceneMaterial
            content={content}
            scene={scene}
            index={index}
            locked={locked}
            onOpen={() => setViewer(gallery.findIndex((entry) => entry.index === index))}
          />
        )}
      />
      <ImageViewer items={items} index={viewer} onClose={() => setViewer(null)} />
    </>
  );
}

/**
 * Il materiale vero di una scena, sotto la sua descrizione: la card di anteprima, e i gesti per caricarlo, cambiarlo,
 * toglierlo; per una scena da girare, «Non posso girarla». Il materiale si carica anche a contenuto approvato (si gira
 * dopo aver deciso cosa girare); cambiare la scena no.
 */
function SceneMaterial({
  content,
  scene,
  index,
  locked,
  onOpen,
}: {
  content: Content;
  scene: VideoScene;
  index: number;
  locked: boolean;
  onOpen: () => void;
}) {
  const toast = useToast();
  const upload = useUploadFootage();
  const remove = useRemoveFootage();
  const replace = useReplaceScene();
  const kind = footageKind(scene.source);
  const pending = upload.isPending && upload.variables?.index === index;
  const replacing = replace.isPending && replace.variables?.index === index;

  if (replacing) return <PreviewSlot>{<AgentStage steps={replace.steps} waiting={VIDEO_SCENE_STEPS.thinking} aspect={9 / 16} />}</PreviewSlot>;
  if (scene.source === 'broll') return <BrollControls content={content} scene={scene} index={index} onOpen={onOpen} />;

  const preview = <ScenePreview scene={scene} busy={pending ? (kind === 'video' ? 'Carico il girato…' : 'Carico la foto…') : null} onOpen={onOpen} />;
  if (!kind) return preview;

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
      toast(footageTooHeavy(asset.fileName ?? (kind === 'video' ? 'Il girato' : 'La foto'), bytes, kind));
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
      {preview}
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
function BrollControls({ content, scene, index, onOpen }: { content: Content; scene: VideoScene; index: number; onOpen: () => void }) {
  const toast = useToast();
  const make = useMakeBroll();
  const lock = useLockScene();
  const working = make.isPending && make.variables?.index === index;

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

  if (working) {
    return (
      <PreviewSlot>
        <AgentStage steps={make.steps} waiting={make.variables?.step === 'frame' ? BROLL_STEPS.frame : BROLL_STEPS.clip} aspect={9 / 16} />
      </PreviewSlot>
    );
  }

  return (
    <View style={styles.column}>
      <ScenePreview scene={scene} busy={null} onOpen={onOpen} />
      {scene.locked ? (
        <Badge tone="navy" size="sm">
          Bloccata
        </Badge>
      ) : scene.frame && !scene.clip ? (
        <Text variant="caption">Se il fotogramma va bene, animalo: la clip parte da qui.</Text>
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

/** Il posto della card di anteprima: lì dentro compare anche l'AI che lavora alla scena. */
function PreviewSlot({ children }: { children: ReactNode }) {
  return <View style={styles.slot}>{children}</View>;
}

const EMPTY: Record<VideoScene['source'], { icon: typeof Camera; text: string }> = {
  shoot: { icon: Camera, text: 'Qui il tuo girato' },
  photo: { icon: ImageIcon, text: 'Qui la tua foto' },
  broll: { icon: Sparkles, text: 'Il b-roll lo preparo io' },
  graphic: { icon: Type, text: 'Grafica del brand' },
};

/** La card di anteprima: il materiale se c'è (un tocco lo apre a tutto schermo), altrimenti cosa ci andrà. */
function ScenePreview({ scene, busy, onOpen }: { scene: VideoScene; busy: string | null; onOpen: () => void }) {
  const media = sceneMedia(scene);

  if (busy) {
    return (
      <View style={[styles.card, styles.empty]}>
        <ActivityIndicator color={colors.textTitle} />
        <Text variant="caption" align="center">
          {busy}
        </Text>
      </View>
    );
  }

  if (!media) {
    const { icon: Icon, text } = EMPTY[scene.source];
    return (
      <View style={[styles.card, styles.empty]}>
        <Icon size={26} color={colors.textBody} />
        <Text variant="strongSmall" align="center">
          {text}
        </Text>
        {scene.overlay ? (
          <Text variant="caption" align="center" numberOfLines={4}>
            «{scene.overlay}»
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Apri ${media.label.toLowerCase()} a tutto schermo`} onPress={onOpen} style={styles.card}>
      {media.kind === 'image' ? (
        <Image source={{ uri: media.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <VideoPoster uri={media.uri} start={scene.source === 'shoot' ? (scene.trim?.start ?? 0) : 0} />
      )}
      {media.kind === 'video' ? (
        <View style={styles.play} pointerEvents="none">
          <Play size={20} color={palette.navy700} fill={palette.navy700} />
        </View>
      ) : null}
      <View style={styles.tag} pointerEvents="none">
        <Text variant="label" color={palette.white}>
          {media.label} · {scene.source === 'shoot' && scene.trim ? `${clock(scene.trim.start)}–${clock(scene.trim.end)}` : SCENE_SOURCE_LABELS[scene.source]}
        </Text>
      </View>
    </Pressable>
  );
}

/** «0:04»: i secondi di un girato come li legge chi l'ha girato. */
function clock(seconds: number): string {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** Il primo fotogramma del video (o del pezzo scelto), fermo e muto: si guarda a tutto schermo. */
function VideoPoster({ uri, start }: { uri: string; start: number }) {
  const [source] = useState(uri);
  const player = useVideoPlayer(source, (created) => {
    created.muted = true;
    // Il pezzo scelto dalla regia: l'anteprima parte da lì.
    if (start > 0) created.currentTime = start;
  });
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <VideoView player={player} style={StyleSheet.absoluteFill} nativeControls={false} contentFit="cover" />
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: 8, paddingTop: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14 },
  slot: { width: PREVIEW_WIDTH, paddingTop: 6 },
  card: {
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceSunken,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: palette.grey300,
  },
  play: {
    position: 'absolute',
    alignSelf: 'center',
    top: PREVIEW_HEIGHT / 2 - 22,
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.88)',
  },
  tag: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(20,22,36,0.62)',
  },
});
