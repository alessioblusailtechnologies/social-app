import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { ImagePlus, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import {
  Button,
  Chip,
  ChipGroup,
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
} from '@/design-system';
import type { Palette, Visual } from '@/domain/brand';
import { IMAGE_STYLES, PALETTE_PRESETS, PALETTE_SLOT_LABELS } from '@/domain/catalog';

import { Swatches } from './BrandVisuals';
import type { EditorProps } from './types';

/** Sul web il logo finisce nello storage locale come data URI: oltre questa soglia lo rifiutiamo. */
const WEB_LOGO_LIMIT = 1_500_000;

export function VisualEditor({ value, onChange, context }: EditorProps<Visual>) {
  const toast = useToast();
  const set = (patch: Partial<Visual>) => onChange({ ...value, ...patch });
  const custom = value.palette.origin === 'custom';

  const sitePalette = context.insights?.palette ?? (value.palette.origin === 'site' ? value.palette : null);
  const options: Palette[] = [...(sitePalette ? [sitePalette] : []), ...PALETTE_PRESETS];

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
              {value.logoUri
                ? 'Lo uso in piccolo sulle immagini generate.'
                : 'SVG o PNG con sfondo trasparente, almeno 512px.'}
            </Text>
          </View>
          <Button size="sm" variant="secondary" onPress={pickLogo}>
            {value.logoUri ? 'Sostituisci' : 'Carica'}
          </Button>
        </View>
        {value.logoUri && <LinkButton label="Rimuovi il logo" tone="muted" onPress={() => set({ logoUri: null })} />}
      </Panel>

      <Panel label="Palette" gap={12}>
        <View style={styles.options}>
          {options.map((option) => {
            const selected = !custom && option.id === value.palette.id;
            return (
              <PressableScale
                key={option.id}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`Palette ${option.name}`}
                onPress={() => set({ palette: option })}
                style={[styles.paletteRow, selected && styles.paletteRowSelected]}>
                <Swatches colors={option.colors} />
                <Text variant="action" style={styles.flex}>
                  {option.name}
                </Text>
                <RadioMark selected={selected} />
              </PressableScale>
            );
          })}
          <PressableScale
            accessibilityRole="radio"
            accessibilityState={{ selected: custom }}
            accessibilityLabel="Usa i miei colori"
            onPress={() =>
              !custom &&
              set({
                palette: {
                  id: 'custom',
                  name: 'I miei colori',
                  colors: [...value.palette.colors],
                  origin: 'custom',
                },
              })
            }
            style={[styles.paletteRow, custom && styles.paletteRowSelected]}>
            {custom ? (
              <Swatches colors={value.palette.colors} />
            ) : (
              <View style={styles.customIcon}>
                <Plus size={14} color={colors.textTitle} />
              </View>
            )}
            <Text variant="action" style={styles.flex}>
              Usa i miei colori
            </Text>
            <RadioMark selected={custom} />
          </PressableScale>
        </View>
        {custom && <CustomPalette palette={value.palette} onChange={(next) => set({ palette: next })} />}
      </Panel>

      <Panel label="Stile delle immagini">
        <ChipGroup>
          {IMAGE_STYLES.map((style) => (
            <Chip
              key={style.id}
              label={style.label}
              selected={value.imageStyle === style.id}
              onPress={() => set({ imageStyle: style.id })}
            />
          ))}
        </ChipGroup>
        <View style={styles.signatureRow}>
          <View style={styles.flex}>
            <Text variant="strongSmall">Firma visiva sulle immagini</Text>
            <Text variant="caption">
              {value.logoUri ? 'Logo piccolo in basso a destra' : 'Serve un logo: caricalo qui sopra'}
            </Text>
          </View>
          <Switch
            value={value.signature && Boolean(value.logoUri)}
            disabled={!value.logoUri}
            onValueChange={(signature) => set({ signature })}
            accessibilityLabel="Firma visiva sulle immagini"
          />
        </View>
      </Panel>
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
  signatureRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 4 },
});
