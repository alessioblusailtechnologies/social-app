import { useRouter } from 'expo-router';
import { Clapperboard, PenLine, X } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import {
  AgentStage,
  Button,
  Chip,
  ChipGroup,
  FormScrollView,
  IconButton,
  KeyboardScreen,
  Panel,
  ScreenFooter,
  ScreenTitle,
  SunkenInput,
  Text,
  TopBar,
  colors,
  palette,
  radii,
  screenStyles,
  useToast,
} from '@/design-system';
import type { Brand, ChannelId } from '@/domain/brand';
import { channelName } from '@/domain/catalog';
import { FORMAT_LABELS, type IdeaFormat, type IdeaSource } from '@/domain/idea';
import { selectedChannels } from '@/domain/plan';
import { stageAspect } from '@/domain/visual';
import { EMPTY_SOURCE, SOURCE_REASONS, SourceFields, sourceFromState, type SourceState } from '@/features/ideas/SourceFields';
import { apiErrorMessage } from '@/services';
import { MATERIAL_STEPS } from '@/services/ai-steps';
import { useCreateContent, useUploadMaterial } from '@/services/queries';
import type { AiStep } from '@/services/types';

import { MaterialPicker, type PickedMaterial } from './MaterialPicker';

const FORMATS = Object.keys(FORMAT_LABELS) as IdeaFormat[];

/** Da dove parte il contenuto: un'idea (scritta, un link, un documento) o il materiale di chi pubblica. */
type Path = 'idea' | 'material';

/**
 * Un contenuto senza passare da idea e piano, per due strade. «Da un'idea»: la fonte, poi la bozza. «Dal tuo
 * materiale»: foto e video del telefono, e la storia la trova l'AI guardandoli: un video coi pezzi migliori, o un
 * carosello con le foto.
 */
export function NewContentScreen({ brand }: { brand: Brand }) {
  const router = useRouter();
  const toast = useToast();
  const create = useCreateContent(brand.id);
  const uploadMaterial = useUploadMaterial(brand.id);
  const [path, setPath] = useState<Path>('idea');
  const [source, setSource] = useState<SourceState>(EMPTY_SOURCE);
  const [material, setMaterial] = useState<PickedMaterial[]>([]);
  const [note, setNote] = useState('');
  const [channels, setChannels] = useState<ChannelId[]>(() => selectedChannels(brand));
  const [format, setFormat] = useState<IdeaFormat>('post');
  const [materialFormat, setMaterialFormat] = useState<'video' | 'carousel' | null>(null);
  /** I passi del caricamento, prima che il lavoro sul server cominci. */
  const [uploadSteps, setUploadSteps] = useState<AiStep[] | null>(null);

  const photos = material.filter((file) => file.kind === 'image').length;
  const videos = material.length - photos;
  // Un carosello si fa con le foto: con qualche video dentro, o con una foto sola, il materiale diventa un video.
  const canCarousel = photos >= 2;
  const chosenFormat: IdeaFormat = path === 'idea' ? format : materialFormat === 'carousel' && canCarousel ? 'carousel' : 'video';

  const request = sourceFromState(source);
  const ready = path === 'idea' ? request !== null : material.length > 0;
  const busy = create.isPending || uploadSteps !== null;
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const toggleChannel = (channel: ChannelId) => {
    if (!channels.includes(channel)) {
      setChannels([...channels, channel]);
      return;
    }
    if (channels.length === 1) {
      toast('Serve almeno un canale.');
      return;
    }
    setChannels(channels.filter((entry) => entry !== channel));
  };

  const write = (asked: IdeaSource, wanted: IdeaFormat) =>
    create.mutate(
      { source: asked, channels, format: wanted },
      {
        onSuccess: (content) => router.replace({ pathname: '/draft/[contentId]', params: { contentId: content.id } }),
        onError: (error) => toast(apiErrorMessage(error, 'Non riesco a preparare la bozza. Riprova.')),
        onSettled: () => setUploadSteps(null),
      },
    );

  /** Il materiale va caricato prima: un file alla volta, poi il server lo guarda e scrive la storia. */
  const submitMaterial = async () => {
    const total = material.length;
    const progress = (done: number): AiStep[] => [
      { id: 'upload', label: MATERIAL_STEPS.upload(done, total), status: done === total ? 'done' : 'running' },
    ];
    setUploadSteps(progress(0));
    const files = [];
    try {
      for (const [index, file] of material.entries()) {
        const stored = await uploadMaterial.mutateAsync({ uri: file.uri, mimeType: file.mimeType, bytes: file.bytes });
        files.push({ path: stored.path, url: stored.url, kind: file.kind, name: file.name });
        setUploadSteps(progress(index + 1));
      }
    } catch (error) {
      setUploadSteps(null);
      toast(apiErrorMessage(error, 'Il caricamento non è riuscito. Riprova.'));
      return;
    }
    write({ kind: 'material', files, note: note.trim() }, chosenFormat);
  };

  const submit = () => {
    if (path === 'material') {
      void submitMaterial();
      return;
    }
    if (request) write(request, format);
  };

  const steps = [...(uploadSteps ?? []), ...create.steps];

  return (
    <KeyboardScreen>
      <TopBar
        safeArea={Platform.OS !== 'ios'}
        title="Nuovo contenuto"
        right={<IconButton icon={X} accessibilityLabel="Chiudi" onPress={close} />}
      />

      <FormScrollView contentContainerStyle={screenStyles.content}>
        {busy ? (
          <>
            <ScreenTitle
              title="Un attimo"
              subtitle={
                path === 'material'
                  ? 'Carico il materiale, lo guardo e scelgo i pezzi migliori per la storia.'
                  : 'Scelgo il taglio, lo lego ai temi del profilo e scrivo seguendo la tua voce.'
              }
            />
            <AgentStage steps={steps} waiting="Rileggo il profilo" aspect={stageAspect(chosenFormat)} />
          </>
        ) : (
          <>
            <ScreenTitle title="Cosa vuoi pubblicare?" subtitle="Parti da un’idea, o da foto e video che hai già: la storia la trovo io." />

            <View style={styles.paths}>
              <PathCard
                icon={PenLine}
                title="Da un’idea"
                text="Scrivi, un link, un documento"
                selected={path === 'idea'}
                onPress={() => setPath('idea')}
              />
              <PathCard
                icon={Clapperboard}
                title="Dal tuo materiale"
                text="Foto e video dal telefono: la storia la trovo io"
                selected={path === 'material'}
                onPress={() => setPath('material')}
              />
            </View>

            {path === 'idea' ? (
              <SourceFields
                value={source}
                onChange={setSource}
                promptLabel="Di cosa vuoi parlare"
                promptPlaceholder="Es. abbiamo chiuso il trimestre con 3 clienti nuovi: racconta come ci siamo arrivati"
              />
            ) : (
              <>
                <Panel label="Il tuo materiale" gap={10}>
                  <MaterialPicker value={material} onChange={setMaterial} />
                  <Text variant="caption">
                    {material.length === 0
                      ? 'Anche grezzo, girato col telefono: guardo tutto e prendo i pezzi migliori.'
                      : [videos > 0 ? `${videos} video` : '', photos > 0 ? `${photos} foto` : ''].filter(Boolean).join(' e ') + '.'}
                  </Text>
                </Panel>
                <Panel label="Cosa vuoi raccontare" gap={8}>
                  <SunkenInput
                    multiline
                    minHeight={72}
                    value={note}
                    onChangeText={setNote}
                    placeholder="Facoltativo. Es. il nuovo colore d’autunno. Se lo lasci vuoto, il taglio lo trovo io."
                    accessibilityLabel="Cosa vuoi raccontare"
                  />
                </Panel>
              </>
            )}

            <Panel label="Canali">
              <ChipGroup>
                {selectedChannels(brand).map((channel) => (
                  <Chip
                    key={channel}
                    label={channelName(channel)}
                    selected={channels.includes(channel)}
                    onPress={() => toggleChannel(channel)}
                  />
                ))}
              </ChipGroup>
            </Panel>

            <Panel label="Formato">
              {path === 'idea' ? (
                <ChipGroup>
                  {FORMATS.map((candidate) => (
                    <Chip key={candidate} label={FORMAT_LABELS[candidate]} selected={candidate === format} onPress={() => setFormat(candidate)} />
                  ))}
                </ChipGroup>
              ) : (
                <ChipGroup>
                  <Chip label={FORMAT_LABELS.video} selected={chosenFormat === 'video'} onPress={() => setMaterialFormat('video')} />
                  <Chip
                    label={FORMAT_LABELS.carousel}
                    selected={chosenFormat === 'carousel'}
                    onPress={() =>
                      canCarousel ? setMaterialFormat('carousel') : toast('Un carosello si fa con almeno 2 foto: i video vanno nel video.')
                    }
                  />
                </ChipGroup>
              )}
              <Text variant="caption">
                {path === 'material' && chosenFormat === 'carousel'
                  ? 'Una slide per foto, con i testi scritti guardandole.'
                  : path === 'material'
                    ? 'I pezzi migliori, ritagliati e montati: quello che manca te lo dico io.'
                    : 'Quando la bozza è pronta scegli se programmarla o pubblicarla subito.'}
              </Text>
            </Panel>
          </>
        )}
      </FormScrollView>

      <ScreenFooter>
        <Button
          size="lg"
          block
          disabled={!ready}
          busy={busy}
          onDisabledPress={() => toast(path === 'idea' ? SOURCE_REASONS[source.mode] : 'Scegli almeno una foto o un video.')}
          onPress={submit}>
          {busy ? 'Sto lavorando…' : 'Prepara la bozza'}
        </Button>
      </ScreenFooter>
    </KeyboardScreen>
  );
}

/** Una delle due strade: grande, perché sono due modi diversi di creare. */
function PathCard({
  icon: Icon,
  title,
  text,
  selected,
  onPress,
}: {
  icon: typeof PenLine;
  title: string;
  text: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.path, selected ? styles.pathOn : styles.pathOff]}>
      <View style={[styles.pathIcon, selected && styles.pathIconOn]}>
        <Icon size={20} color={selected ? palette.white : colors.textTitle} />
      </View>
      <Text variant="strong">{title}</Text>
      <Text variant="caption">{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  paths: { flexDirection: 'row', gap: 10 },
  path: { flex: 1, minHeight: 132, padding: 14, gap: 6, borderRadius: radii.lg, borderWidth: 2 },
  pathOn: { borderColor: colors.borderStrong, backgroundColor: colors.surfaceCard },
  pathOff: { borderColor: 'transparent', backgroundColor: colors.surfaceCard },
  pathIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSunken,
    marginBottom: 4,
  },
  pathIconOn: { backgroundColor: palette.orange500 },
});
