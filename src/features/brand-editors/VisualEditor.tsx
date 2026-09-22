import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { ArrowUp, ImagePlus, Plus, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Platform, ScrollView, StyleSheet, View } from 'react-native';

import {
  Button,
  IconButton,
  LinkButton,
  Panel,
  PressableScale,
  RadioMark,
  StepList,
  SunkenInput,
  Switch,
  Text,
  colors,
  palette,
  radii,
  useToast,
} from '@/design-system';
import type { ChannelId, Palette, Visual, VisualExample } from '@/domain/brand';
import { CHANNELS, channelName, PALETTE_SLOT_LABELS } from '@/domain/catalog';
import { ASPECT_SIZES, brandKit, type BrandKit, type MediaFile } from '@/domain/visual';
import { CardView } from '@/features/visual/CardView';
import { apiErrorMessage } from '@/services';
import { useProposeVisualStyle, useUploadReference } from '@/services/queries';

import { Swatches } from './BrandVisuals';
import type { EditorProps } from './types';

/** Sul web il logo finisce nello storage locale come data URI: oltre questa soglia lo rifiutiamo. */
const WEB_LOGO_LIMIT = 1_500_000;
/** Oltre questa misura l'immagine non passa dal corpo della richiesta. */
const REFERENCE_LIMIT = 3_000_000;
const MAX_REFERENCES = 6;
const EXAMPLE_WIDTH = 150;

export function VisualEditor({ value, onChange, context }: EditorProps<Visual>) {
  const toast = useToast();
  const upload = useUploadReference();
  const propose = useProposeVisualStyle();
  const [notes, setNotes] = useState(value.notes ?? '');
  const [uploading, setUploading] = useState(0);
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
      const dataUri = asset.base64 ? `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}` : null;
      try {
        if (dataUri && dataUri.length > REFERENCE_LIMIT) throw new Error('troppo pesante');
        added.push(await upload.mutateAsync({ uri: asset.uri, dataUri }));
      } catch (error) {
        toast(apiErrorMessage(error, 'Un’immagine è troppo pesante o non si legge: l’ho saltata.'));
      } finally {
        setUploading((count) => Math.max(0, count - 1));
      }
    }
    if (added.length > 0) onChange({ ...latest.current, references: [...(latest.current.references ?? []), ...added] });
  };

  const generate = () => {
    Keyboard.dismiss();
    const request: Visual = { ...latest.current, notes: notes.trim() };
    onChange(request);
    propose.mutate(
      {
        identity: context.draft.identity,
        themes: context.draft.themes.map((theme) => theme.name).filter(Boolean),
        visual: request,
        channels,
      },
      {
        onSuccess: (style) =>
          onChange({
            ...latest.current,
            typography: style.typography,
            imageStyle: style.imageStyle,
            direction: style.direction,
            examples: style.examples,
          }),
        onError: (error) => toast(apiErrorMessage(error, 'Non sono riuscito a preparare gli esempi. Riprova.')),
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
              <Text variant="strongSmall">Firma sulle card</Text>
              <Text variant="caption">Logo piccolo in basso a destra</Text>
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
              <Image source={{ uri: file.url }} contentFit="cover" style={styles.referenceImage} accessibilityLabel={`Riferimento ${index + 1}`} />
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
        {propose.isPending ? (
          <StepList steps={propose.steps} />
        ) : examples.length > 0 ? (
          <>
            {value.direction?.summary ? (
              <Text variant="body" color={colors.textTitle}>
                {value.direction.summary}
              </Text>
            ) : null}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.examples}>
              {examples.map((example) => (
                <ExampleCard key={example.channel} example={example} kit={kit} />
              ))}
            </ScrollView>
          </>
        ) : (
          <Text variant="caption">
            Carica qualche immagine che ti piace o scrivi come vuoi apparire: preparo una card di esempio per ogni canale scelto.
          </Text>
        )}

        <View style={styles.notesRow}>
          <SunkenInput
            style={styles.flex}
            value={notes}
            onChangeText={setNotes}
            placeholder="Indicazioni, es. più minimal, titoli con le grazie"
            returnKeyType="send"
            onSubmitEditing={() => !propose.isPending && generate()}
            accessibilityLabel="Indicazioni sullo stile"
          />
          <IconButton
            icon={ArrowUp}
            variant="solid"
            size={40}
            iconSize={18}
            accessibilityLabel={examples.length > 0 ? 'Rigenera gli esempi' : 'Genera gli esempi'}
            disabled={propose.isPending}
            onPress={generate}
          />
        </View>
        {!propose.isPending && (
          <Button size="sm" variant="secondary" onPress={generate}>
            {examples.length > 0 ? 'Rigenera gli esempi' : 'Genera gli esempi'}
          </Button>
        )}
      </Panel>
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
function ExampleCard({ example, kit }: { example: VisualExample; kit: BrandKit }) {
  const [broken, setBroken] = useState(false);
  const size = ASPECT_SIZES[example.aspect];
  const url = example.file?.url;
  return (
    <View style={styles.example}>
      {url && !broken ? (
        <Image
          source={{ uri: url }}
          contentFit="cover"
          style={[styles.exampleImage, { aspectRatio: size.width / size.height }]}
          onError={() => setBroken(true)}
          accessibilityLabel={`Esempio per ${channelName(example.channel)}`}
        />
      ) : (
        <CardView
          kit={kit}
          page={example.page}
          pageIndex={0}
          pageCount={1}
          photoUrl={null}
          cutoutUrl={null}
          aspect={example.aspect}
          width={EXAMPLE_WIDTH}
        />
      )}
      <Text variant="caption">
        {channelName(example.channel)} · {example.aspect}
      </Text>
    </View>
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
  examples: { gap: 10 },
  example: { width: EXAMPLE_WIDTH, gap: 6 },
  exampleImage: { width: EXAMPLE_WIDTH, borderRadius: radii.sm, backgroundColor: colors.surfaceSunken },
  notesRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
