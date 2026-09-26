import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Info, Play, Plus, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { IconButton, Text, colors, palette, radii, useToast } from '@/design-system';
import { FOOTAGE_LIMIT_NOTE, FOOTAGE_TYPES, footageTooHeavy } from '@shared/domain/content';
import { MATERIAL_LIMIT } from '@shared/domain/idea';

/** Un file scelto dal telefono, prima di caricarlo. */
export interface PickedMaterial {
  key: string;
  uri: string;
  mimeType: string;
  bytes: number;
  kind: 'video' | 'image';
  name: string;
  /** Solo per i video, in secondi. */
  seconds: number | null;
}

const EXTENSION_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

const COLUMNS = 3;
const GAP = 8;

function mimeTypeOf(asset: ImagePicker.ImagePickerAsset): string {
  if (asset.mimeType) return asset.mimeType;
  const extension = (asset.fileName ?? asset.uri).split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_TYPES[extension] ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');
}

/**
 * Le foto e i video del telefono, per la creazione «dal tuo materiale»: una griglia di anteprime, si aggiungono e si
 * tolgono. Tipo e peso si controllano già qui, così non si carica niente che il server rifiuterebbe.
 */
export function MaterialPicker({ value, onChange }: { value: PickedMaterial[]; onChange: (files: PickedMaterial[]) => void }) {
  const toast = useToast();
  const [width, setWidth] = useState(0);
  const tile = width > 0 ? Math.floor((width - GAP * (COLUMNS - 1)) / COLUMNS) : 0;
  const room = MATERIAL_LIMIT - value.length;

  const add = async () => {
    if (room <= 0) {
      toast(`Al massimo ${MATERIAL_LIMIT} file: togline uno per aggiungerne altri.`);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      selectionLimit: room,
      quality: 0.85,
      exif: false,
    });
    if (result.canceled) return;
    const picked: PickedMaterial[] = [];
    let skipped = 0;
    const heavy: string[] = [];
    for (const asset of result.assets.slice(0, room)) {
      const mimeType = mimeTypeOf(asset);
      const kind = FOOTAGE_TYPES.video.mimeTypes.includes(mimeType) ? 'video' : FOOTAGE_TYPES.image.mimeTypes.includes(mimeType) ? 'image' : null;
      if (!kind) {
        skipped += 1;
        continue;
      }
      // Quanto pesa, se il selettore non lo dice: lo si chiede al file.
      const bytes = asset.fileSize ?? (await (await fetch(asset.uri)).blob()).size;
      if (bytes > FOOTAGE_TYPES[kind].maxBytes) {
        heavy.push(footageTooHeavy(asset.fileName ?? (kind === 'video' ? 'Il video' : 'La foto'), bytes, kind));
        continue;
      }
      picked.push({
        key: `${asset.assetId ?? asset.uri}-${Date.now()}-${picked.length}`,
        uri: asset.uri,
        mimeType,
        bytes,
        kind,
        name: asset.fileName ?? `${kind === 'video' ? 'Video' : 'Foto'} ${value.length + picked.length + 1}`,
        seconds: kind === 'video' && asset.duration ? Math.round(asset.duration / 1000) : null,
      });
    }
    // Un file troppo pesante si dice per nome, con cosa fare; uno di un tipo che non si legge, in blocco.
    if (heavy.length > 0) toast(heavy.length === 1 ? heavy[0] : `${heavy.length} file pesano troppo. ${FOOTAGE_LIMIT_NOTE}`);
    else if (skipped > 0) toast(skipped === 1 ? 'Un file l’ho saltato: non è un video MP4 o MOV né una foto PNG, JPEG o WebP.' : `${skipped} file li ho saltati: non sono video MP4 o MOV né foto PNG, JPEG o WebP.`);
    if (picked.length > 0) onChange([...value, ...picked]);
  };

  return (
    <View style={styles.column}>
      <View onLayout={(event: LayoutChangeEvent) => setWidth(Math.floor(event.nativeEvent.layout.width))} style={styles.grid}>
        {tile > 0 &&
          value.map((file) => (
            <View key={file.key} style={[styles.tile, { width: tile, height: tile }]}>
              {file.kind === 'image' ? (
                <Image source={{ uri: file.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : (
                <View style={[StyleSheet.absoluteFill, styles.video]}>
                  <Play size={22} color={palette.white} fill={palette.white} />
                  {file.seconds ? (
                    <Text variant="label" color={palette.white}>
                      {file.seconds}s
                    </Text>
                  ) : null}
                </View>
              )}
              <IconButton
                icon={X}
                variant="surface"
                size={28}
                iconSize={14}
                accessibilityLabel={`Togli ${file.name}`}
                onPress={() => onChange(value.filter((entry) => entry.key !== file.key))}
                style={styles.remove}
              />
            </View>
          ))}
        {tile > 0 && room > 0 && (
          <Pressable accessibilityRole="button" accessibilityLabel="Aggiungi foto e video" onPress={add} style={[styles.tile, styles.add, { width: tile, height: tile }]}>
            <Plus size={22} color={colors.textTitle} />
            <Text variant="caption" align="center">
              {value.length === 0 ? 'Foto e video' : 'Aggiungi'}
            </Text>
          </Pressable>
        )}
      </View>
      {/* Il limite si dice prima, non dopo un caricamento fallito a metà. */}
      <View style={styles.note}>
        <Info size={16} color={colors.textTitle} />
        <Text variant="caption" style={styles.noteText}>
          {FOOTAGE_LIMIT_NOTE}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: 10 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, borderRadius: radii.md, backgroundColor: colors.surfaceSunken },
  noteText: { flex: 1, minWidth: 0 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  tile: { borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.surfaceSunken },
  video: { alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: palette.navy700 },
  remove: { position: 'absolute', top: 4, right: 4 },
  add: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: palette.grey300,
    backgroundColor: 'transparent',
  },
});
