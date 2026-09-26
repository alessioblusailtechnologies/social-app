import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { ArrowUp, ImagePlus, Plus, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Platform, StyleSheet, View } from 'react-native';

import {
  AgentStage,
  Button,
  IconButton,
  ImageViewer,
  LinkButton,
  Panel,
  PressableScale,
  RadioMark,
  SunkenInput,
  Switch,
  Text,
  colors,
  palette,
  radii,
  useToast,
  type ViewerItem,
} from '@/design-system';
import { currentVoiceCard, type BrandLine, type ChannelId, type Palette, type Visual, type VisualExample } from '@shared/domain/brand';
import { CHANNELS, channelName, PALETTE_SLOT_LABELS } from '@shared/domain/catalog';
import { describeLineFonts, sameReferences } from '@shared/domain/line';
import { ASPECT_SIZES, brandKit, type BrandKit, type MediaFile } from '@shared/domain/visual';
import { CardView } from '@/features/visual/CardView';
import { apiErrorMessage } from '@/services';
import { pickedImageDataUri } from '@/lib/image';
import { useProfileJob, useProposeVisualStyle, useUploadReference } from '@/services/queries';
import type { VisualStyle } from '@shared/services/types';

import { Swatches } from './BrandVisuals';
import { MusicPanel } from './MusicPanel';
import { VideoProfilePanel } from './VideoProfilePanel';
import type { EditorProps } from './types';

/** Sul web il logo finisce nello storage locale come data URI: oltre questa soglia lo rifiutiamo. */
const WEB_LOGO_LIMIT = 1_500_000;
/** Oltre questa misura l'immagine non passa dal corpo della richiesta. */
const REFERENCE_LIMIT = 3_000_000;
const MAX_REFERENCES = 6;
const EXAMPLE_GAP = 10;

export function VisualEditor({ value, onChange, context }: EditorProps<Visual>) {
  const toast = useToast();
  const upload = useUploadReference();
  const propose = useProposeVisualStyle();
  const [notes, setNotes] = useState(value.notes ?? '');
  const [uploading, setUploading] = useState(0);
  const [viewer, setViewer] = useState<{ group: 'references' | 'examples'; index: number } | null>(null);
  // Gli esempi stanno in una griglia a due colonne: si vedono tutti, senza scorrere di lato.
  const [gridWidth, setGridWidth] = useState(0);
  const exampleWidth = Math.floor((gridWidth - EXAMPLE_GAP) / 2);
  // Caricamenti ed esempi finiscono dopo secondi: il risultato si aggiunge al profilo com'è adesso, non com'era.
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  });

  const set = (patch: Partial<Visual>) => onChange({ ...value, ...patch });
  const references = value.references ?? [];
  const examples = value.examples ?? [];
  const selected = CHANNELS.filter(({ id }) => context.draft.channels[id].selected).map(({ id }) => id);
  const channels: ChannelId[] = selected.length > 0 ? selected : ['instagram'];
  const kit = brandKit({ identity: context.draft.identity, visual: value });

  const sitePalette = context.insights?.palette ?? (value.palette.origin === 'site' ? value.palette : null);
  const custom = value.palette.origin !== 'site';
  const useCustom = () =>
    set({ palette: { id: 'custom', name: 'I miei colori', colors: [...value.palette.colors], origin: 'custom' } });

  const pickLogo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
    });
    if (result.canceled) return;
    const uri = result.assets[0].uri;
    if (Platform.OS === 'web' && uri.length > WEB_LOGO_LIMIT) {
      toast('Il file è troppo pesante per la demo sul web: usa un logo più leggero.');
      return;
    }
    set({ logoUri: uri });
    toast('Logo caricato.');
  };

  const pickReferences = async () => {
    const room = MAX_REFERENCES - references.length;
    if (room <= 0) {
      toast(`Al massimo ${MAX_REFERENCES} immagini: togline una per aggiungerne altre.`);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: room,
      quality: 0.6,
      base64: true,
      exif: false,
    });
    if (result.canceled) return;
    const picked = result.assets.slice(0, room);
    setUploading(picked.length);
    const added: MediaFile[] = [];
    for (const asset of picked) {
      // Il tipo lo diciamo dai byte, non dal nome del file: un'immagine salvata da internet è
      // spesso un WebP che il telefono chiama JPEG, e il backend, che guarda i byte, la rifiuta.
      const dataUri = pickedImageDataUri(asset);
      try {
        if (!dataUri) throw new Error('formato');
        if (dataUri.length > REFERENCE_LIMIT) throw new Error('troppo pesante');
        added.push(await upload.mutateAsync({ uri: asset.uri, dataUri }));
      } catch (error) {
        const unreadable = error instanceof Error && error.message === 'formato';
        toast(
          unreadable
            ? 'Questa immagine non è un PNG, un JPEG o un WebP: l’ho saltata.'
            : apiErrorMessage(error, 'Un’immagine è troppo pesante o non si legge: l’ho saltata.'),
        );
      } finally {
        setUploading((count) => Math.max(0, count - 1));
      }
    }
    if (added.length > 0) onChange({ ...latest.current, references: [...(latest.current.references ?? []), ...added] });
  };

  // La freccia manda quello che è scritto: con la linea già fatta è una correzione, e il resto (foto compresa)
  // resta com'è. Il bottone sotto riparte sempre da capo, con le indicazioni scritte se ci sono.
  const hasLine = Boolean(value.line);
  // La correzione vale per la linea nata da questi riferimenti: con riferimenti nuovi si rifà da capo.
  const correctable = hasLine && sameReferences(value.line, references.map((file) => file.path));
  const written = notes.trim().length > 0;
  const sendLabel = correctable ? 'Applica le correzioni' : hasLine ? 'Rifai la linea coi riferimenti nuovi' : 'Prepara la linea';
  const restartLabel = hasLine ? 'Rifai la linea da capo' : 'Prepara la linea';

  /** La linea arrivata: dalla generazione appena chiesta o da una ripresa da prima. */
  const applyStyle = (style: VisualStyle) => {
    onChange({
      ...latest.current,
      typography: style.typography,
      imageStyle: style.imageStyle,
      direction: style.direction,
      line: style.line,
      examples: style.examples,
      // Il profilo video nasce con la prima linea; uno che c'era già resta.
      ...(style.video && { video: style.video }),
    });
  };

  /**
   * Disegnare la linea richiede minuti: se il telefono si spegne o si cambia passo, il lavoro
   * va avanti sul server e tornando qui ci si rimette a guardarlo.
   */
  const resumed = useProfileJob<VisualStyle>('visual-style', applyStyle, !propose.isPending);
  const preparing = propose.isPending || resumed.resuming;
  const lineSteps = propose.isPending ? propose.steps : resumed.steps;

  /** Chi è il brand adesso, con le modifiche non ancora salvate: serve alla linea e al profilo video. */
  const describe = () => ({
    identity: context.draft.identity,
    themes: context.draft.themes.map((theme) => theme.name).filter(Boolean),
    visual: latest.current,
    channels,
    goals: context.draft.positioning.goals,
    audiences: context.draft.positioning.audiences,
    voice: currentVoiceCard(context.draft.voice),
    siteSummary: context.insights?.summary || undefined,
  });

  const generate = (restart: boolean) => {
    Keyboard.dismiss();
    const applied = correctable && !restart && written;
    const request: Visual = { ...latest.current, notes: notes.trim() };
    onChange(request);
    propose.mutate(
      { ...describe(), visual: request, restart },
      {
        onSuccess: (style) => {
          applyStyle(style);
          // Applicata la correzione, la casella si svuota per la prossima.
          if (applied) setNotes('');
        },
        onError: (error) => toast(apiErrorMessage(error, 'Non sono riuscito a preparare la linea. Riprova.')),
      },
    );
  };

  return (
    <View style={styles.column}>
      <Panel label="Logo">
        <View style={styles.logoRow}>
          <View style={[styles.logoBox, !value.logoUri && styles.logoEmpty]}>
            {value.logoUri ? (
              <Image source={{ uri: value.logoUri }} contentFit="contain" style={styles.logoImage} accessibilityLabel="Logo" />
            ) : (
              <ImagePlus size={20} color={palette.grey300} />
            )}
          </View>
          <View style={styles.flex}>
            <Text variant="strongSmall">{value.logoUri ? 'Logo caricato' : 'Nessun logo'}</Text>
            <Text variant="caption">
              {value.logoUri ? 'Lo uso in piccolo sulle card.' : 'SVG o PNG con sfondo trasparente, almeno 512px.'}
            </Text>
          </View>
          <Button size="sm" variant="secondary" onPress={pickLogo}>
            {value.logoUri ? 'Sostituisci' : 'Carica'}
          </Button>
        </View>
        {value.logoUri && (
          <View style={styles.switchRow}>
            <View style={styles.flex}>
              <Text variant="strongSmall">Logo sulle card</Text>
              <Text variant="caption">In piccolo accanto alla firma, in basso</Text>
            </View>
            <Switch
              value={value.signature}
              onValueChange={(signature) => set({ signature })}
              accessibilityLabel="Firma sulle card"
            />
          </View>
        )}
        {value.logoUri && <LinkButton label="Rimuovi il logo" tone="muted" onPress={() => set({ logoUri: null })} />}
      </Panel>

      <Panel label="Palette" gap={12}>
        {sitePalette ? (
          <View style={styles.options}>
            <PaletteOption
              label={`Dal sito · ${context.insights?.site ?? 'letto prima'}`}
              colors={sitePalette.colors}
              selected={!custom}
              onPress={() => set({ palette: sitePalette })}
            />
            <PaletteOption label="Usa i miei colori" colors={custom ? value.palette.colors : null} selected={custom} onPress={useCustom} />
          </View>
        ) : (
          <Text variant="caption">Scrivi i colori del marchio: li uso su tutte le card.</Text>
        )}
        {custom && (
          <CustomPalette
            palette={value.palette}
            onChange={(next) => set({ palette: { ...next, id: 'custom', name: 'I miei colori', origin: 'custom' } })}
          />
        )}
      </Panel>

      <Panel label="Immagini di riferimento" gap={12}>
        <Text variant="caption">
          Post, foto o grafiche che ti piacciono, anche di altri. Ne ricavo caratteri, forme e stile delle foto.
        </Text>
        <View style={styles.references}>
          {references.map((file, index) => (
            <View key={file.path ?? file.url} style={styles.reference}>
              <PressableScale
                accessibilityRole="imagebutton"
                accessibilityLabel={`Riferimento ${index + 1}: aprilo a tutto schermo`}
                onPress={() => setViewer({ group: 'references', index })}>
                <Image source={{ uri: file.url }} contentFit="cover" style={styles.referenceImage} />
              </PressableScale>
              <IconButton
                icon={X}
                variant="solid"
                size={24}
                iconSize={12}
                accessibilityLabel={`Togli il riferimento ${index + 1}`}
                onPress={() => set({ references: references.filter((_, i) => i !== index) })}
                style={styles.referenceRemove}
              />
            </View>
          ))}
          {Array.from({ length: uploading }, (_, i) => (
            <View key={`uploading-${i}`} style={[styles.reference, styles.referenceEmpty]}>
              <ActivityIndicator size="small" color={colors.actionPrimary} />
            </View>
          ))}
          {references.length + uploading < MAX_REFERENCES && (
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Aggiungi immagini di riferimento"
              onPress={pickReferences}
              style={[styles.reference, styles.referenceEmpty]}>
              <Plus size={18} color={colors.textTitle} />
            </PressableScale>
          )}
        </View>
      </Panel>

      <Panel label="Come escono le card" gap={12}>
        {preparing ? (
          <AgentStage steps={lineSteps} />
        ) : examples.length > 0 ? (
          <>
            {value.direction?.summary ? (
              <Text variant="body" color={colors.textTitle}>
                {value.direction.summary}
              </Text>
            ) : null}
            {value.line ? <LineSummary line={value.line} /> : null}
            <View style={styles.examples} onLayout={(event) => setGridWidth(Math.floor(event.nativeEvent.layout.width))}>
              {exampleWidth > 0 &&
                examples.map((example, index) => (
                  <ExampleCard
                    key={`${example.channel}-${index}`}
                    example={example}
                    kit={kit}
                    width={exampleWidth}
                    onPress={() => setViewer({ group: 'examples', index })}
                  />
                ))}
            </View>
          </>
        ) : (
          <Text variant="caption">
            Carica qualche immagine che ti piace o scrivi come vuoi apparire: preparo la linea delle tue card (fondo, caratteri, firma, rubriche) e le prime card per i tuoi canali.
          </Text>
        )}

        <View style={styles.notesRow}>
          <SunkenInput
            style={styles.flex}
            value={notes}
            onChangeText={setNotes}
            placeholder={
              hasLine ? 'Cosa cambio? es. foto a tutta larghezza, titoli più grandi' : 'Indicazioni, es. fondo chiaro, titoli con le grazie'
            }
            returnKeyType="send"
            onSubmitEditing={() => !preparing && (written || !correctable) && generate(false)}
            accessibilityLabel="Indicazioni sullo stile"
          />
          <IconButton
            icon={ArrowUp}
            variant="solid"
            size={40}
            iconSize={18}
            accessibilityLabel={sendLabel}
            disabled={preparing || (correctable && !written)}
            onPress={() => generate(false)}
          />
        </View>
        {hasLine && !preparing ? (
          <Text variant="caption">
            {correctable
              ? 'Con la freccia cambio solo quello che scrivi: il resto della linea, i testi e la foto restano. «Rifai la linea da capo» riparte da zero.'
              : 'Hai cambiato le immagini di riferimento: la linea si rifà da capo con quelle nuove.'}
          </Text>
        ) : null}
        {!preparing && (
          <Button size="sm" variant="secondary" onPress={() => generate(hasLine)}>
            {restartLabel}
          </Button>
        )}
      </Panel>

      <VideoProfilePanel value={value.video} onChange={(video) => onChange({ ...latest.current, video })} request={describe} />

      {context.brandId ? (
        <MusicPanel brandId={context.brandId} value={value.music} onChange={(music) => onChange({ ...latest.current, music })} />
      ) : null}

      <ImageViewer
        items={
          viewer?.group === 'examples'
            ? examples.map((example, index) => exampleViewerItem(example, kit, index))
            : references.map((file, index) => ({
                key: file.path ?? file.url,
                uri: file.url,
                label: `Riferimento ${index + 1} di ${references.length}`,
              }))
        }
        index={viewer?.index ?? null}
        onClose={() => setViewer(null)}
      />
    </View>
  );
}

/** Nel visore a tutto schermo: il PNG composto, o la stessa card disegnata dal vivo. */
function exampleViewerItem(example: VisualExample, kit: BrandKit, index: number): ViewerItem {
  const size = ASPECT_SIZES[example.aspect];
  return {
    key: `${example.channel}-${index}`,
    uri: example.file?.url || null,
    aspectRatio: size.width / size.height,
    label: `${channelName(example.channel)} · ${example.aspect}`,
    fallback: (width) => (
      <CardView
        kit={kit}
        page={example.page}
        pageIndex={0}
        pageCount={1}
        photoUrl={example.photo?.url || null}
        cutoutUrl={null}
        aspect={example.aspect}
        width={width}
      />
    ),
  };
}

/** La linea a parole: caratteri, firma e rubriche, quello che resta uguale in ogni card. */
function LineSummary({ line }: { line: BrandLine }) {
  const rows = [
    ['Caratteri', describeLineFonts(line)],
    ['Firma', [line.signature, line.address].filter(Boolean).join(' · ')],
    ['Rubriche', line.rubrics.map((rubric) => rubric.name).join(' · ')],
  ].filter(([, text]) => text);
  return (
    <View style={styles.lineRows}>
      {rows.map(([label, text]) => (
        <View key={label} style={styles.lineRow}>
          <Text variant="caption" style={styles.lineLabel}>
            {label}
          </Text>
          <Text variant="strongSmall" style={styles.flex}>
            {text}
          </Text>
        </View>
      ))}
    </View>
  );
}

function PaletteOption({
  label,
  colors: swatches,
  selected,
  onPress,
}: {
  label: string;
  colors: readonly string[] | null;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.paletteRow, selected && styles.paletteRowSelected]}>
      {swatches ? (
        <Swatches colors={swatches} />
      ) : (
        <View style={styles.customIcon}>
          <Plus size={14} color={colors.textTitle} />
        </View>
      )}
      <Text variant="action" numberOfLines={1} style={styles.flex}>
        {label}
      </Text>
      <RadioMark selected={selected} />
    </PressableScale>
  );
}

/** Il PNG composto da be-render; senza (mock, servizio giù o indirizzo scaduto) la stessa card disegnata dal vivo. */
function ExampleCard({ example, kit, width, onPress }: { example: VisualExample; kit: BrandKit; width: number; onPress: () => void }) {
  const [broken, setBroken] = useState(false);
  const size = ASPECT_SIZES[example.aspect];
  const url = example.file?.url;
  return (
    <PressableScale
      accessibilityRole="imagebutton"
      accessibilityLabel={`Esempio per ${channelName(example.channel)}: aprilo a tutto schermo`}
      onPress={onPress}
      style={[styles.example, { width }]}>
      {url && !broken ? (
        <Image
          source={{ uri: url }}
          contentFit="cover"
          style={[styles.exampleImage, { width, aspectRatio: size.width / size.height }]}
          onError={() => setBroken(true)}
          accessibilityLabel={`Esempio per ${channelName(example.channel)}`}
        />
      ) : (
        <CardView
          kit={kit}
          page={example.page}
          pageIndex={0}
          pageCount={1}
          photoUrl={example.photo?.url || null}
          cutoutUrl={null}
          aspect={example.aspect}
          width={width}
        />
      )}
      <Text variant="caption">
        {channelName(example.channel)} · {example.aspect}
      </Text>
    </PressableScale>
  );
}

function normalizeHex(input: string): string | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(input.trim());
  return match ? `#${match[1].toUpperCase()}` : null;
}

function CustomPalette({ palette: current, onChange }: { palette: Palette; onChange: (palette: Palette) => void }) {
  const [drafts, setDrafts] = useState<string[]>(() => current.colors.map((color) => color.toUpperCase()));

  const edit = (index: number, text: string) => {
    setDrafts(drafts.map((draft, i) => (i === index ? text : draft)));
    const hex = normalizeHex(text);
    if (!hex) return;
    const next: Palette['colors'] = [...current.colors];
    next[index] = hex;
    onChange({ ...current, colors: next });
  };

  return (
    <View style={styles.options}>
      {PALETTE_SLOT_LABELS.map((label, index) => (
        <View key={label} style={styles.slotRow}>
          <View style={[styles.slotSwatch, { backgroundColor: current.colors[index] }]} />
          <Text variant="caption" style={styles.slotLabel}>
            {label}
          </Text>
          <SunkenInput
            style={styles.flex}
            value={drafts[index]}
            onChangeText={(text) => edit(index, text)}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={7}
            accessibilityLabel={`Colore ${label}`}
          />
        </View>
      ))}
      <Text variant="caption">Scrivi i codici esadecimali, per esempio #2F3452.</Text>
    </View>
  );
}

const REFERENCE_SIZE = 72;

const styles = StyleSheet.create({
  column: { gap: 12 },
  flex: { flex: 1, minWidth: 0, gap: 3 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoBox: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoEmpty: { borderWidth: 1.5, borderColor: colors.borderField, borderStyle: 'dashed' },
  logoImage: { width: 48, height: 48 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 4 },
  options: { gap: 8 },
  paletteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.borderSubtle,
  },
  paletteRowSelected: { borderColor: colors.borderStrong },
  customIcon: {
    width: 87,
    height: 18,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSunken,
  },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  slotSwatch: { width: 28, height: 28, borderRadius: 8, borderWidth: 1, borderColor: palette.grey100 },
  slotLabel: { width: 72 },
  references: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reference: { width: REFERENCE_SIZE, height: REFERENCE_SIZE, borderRadius: radii.md, overflow: 'hidden' },
  referenceImage: { width: REFERENCE_SIZE, height: REFERENCE_SIZE },
  referenceEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.borderField,
    borderStyle: 'dashed',
  },
  referenceRemove: { position: 'absolute', top: 4, right: 4 },
  examples: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: EXAMPLE_GAP },
  example: { gap: 6 },
  exampleImage: { borderRadius: radii.sm, backgroundColor: colors.surfaceSunken },
  notesRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lineRows: { gap: 6 },
  lineRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  lineLabel: { width: 72 },
});
