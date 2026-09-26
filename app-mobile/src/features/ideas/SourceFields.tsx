import * as DocumentPicker from 'expo-document-picker';
import { FileText, FileUp } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import {
  Button,
  FieldCard,
  Panel,
  PressableScale,
  SegmentedControl,
  Text,
  colors,
  radii,
  screenStyles,
  useToast,
} from '@/design-system';
import type { IdeaSource } from '@shared/domain/idea';

/** Da dove parte l'utente: una frase, un link o un documento. Serve a Nuova idea e a Nuovo contenuto. */

export type SourceMode = 'prompt' | 'link' | 'document';

export interface SourceState {
  mode: SourceMode;
  text: string;
  url: string;
  note: string;
  file: { name: string; size: number | null } | null;
}

export const EMPTY_SOURCE: SourceState = { mode: 'prompt', text: '', url: '', note: '', file: null };

export const SOURCE_REASONS: Record<SourceMode, string> = {
  prompt: 'Scrivi almeno una frase su cosa vuoi dire.',
  link: 'Incolla un link completo, per esempio https://…',
  document: 'Scegli un documento.',
};

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

const DOCUMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
];

const looksLikeUrl = (value: string) => /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(value.trim());

/** La fonte pronta da mandare all'AI, oppure null se manca ancora qualcosa. */
export function sourceFromState(state: SourceState): IdeaSource | null {
  if (state.mode === 'prompt') return state.text.trim().length >= 12 ? { kind: 'prompt', text: state.text.trim() } : null;
  if (state.mode === 'link') return looksLikeUrl(state.url) ? { kind: 'link', url: state.url.trim(), note: state.note.trim() } : null;
  return state.file ? { kind: 'document', name: state.file.name, size: state.file.size, note: state.note.trim() } : null;
}

export function formatSize(bytes: number): string {
  return bytes >= 1_000_000
    ? `${(bytes / 1_000_000).toFixed(1).replace('.', ',')} MB`
    : `${Math.max(1, Math.round(bytes / 1000))} KB`;
}

export interface SourceFieldsProps {
  value: SourceState;
  onChange: (value: SourceState) => void;
  promptLabel: string;
  promptPlaceholder: string;
}

export function SourceFields({ value, onChange, promptLabel, promptPlaceholder }: SourceFieldsProps) {
  const toast = useToast();
  const set = (patch: Partial<SourceState>) => onChange({ ...value, ...patch });

  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: DOCUMENT_TYPES, copyToCacheDirectory: false });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset.size && asset.size > MAX_DOCUMENT_BYTES) {
      toast('Il documento supera i 10 MB.');
      return;
    }
    set({ file: { name: asset.name, size: asset.size ?? null } });
  };

  return (
    <>
      <SegmentedControl
        accessibilityLabel="Da dove parti"
        value={value.mode}
        onChange={(mode) => set({ mode })}
        options={[
          { value: 'prompt', label: 'Scrivi' },
          { value: 'link', label: 'Link' },
          { value: 'document', label: 'Documento' },
        ]}
      />

      {value.mode === 'prompt' && (
        <>
          <FieldCard
            label={promptLabel}
            value={value.text}
            onChangeText={(text) => set({ text })}
            multiline
            autoFocus
            placeholder={promptPlaceholder}
          />
          <Text variant="caption" style={screenStyles.groupLabel}>
            Va bene anche un appunto veloce, o dettato con la tastiera: il resto lo sistemo io.
          </Text>
        </>
      )}

      {value.mode === 'link' && (
        <FieldCard
          label="Link"
          value={value.url}
          onChangeText={(url) => set({ url })}
          placeholder="https://…"
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
        />
      )}

      {value.mode === 'document' &&
        (value.file ? (
          <Panel>
            <View style={styles.fileRow}>
              <View style={styles.fileIcon}>
                <FileText size={18} color={colors.textTitle} />
              </View>
              <View style={styles.flex}>
                <Text variant="strongSmall" numberOfLines={1}>
                  {value.file.name}
                </Text>
                {value.file.size ? <Text variant="caption">{formatSize(value.file.size)}</Text> : null}
              </View>
              <Button size="sm" variant="secondary" onPress={pickDocument}>
                Cambia
              </Button>
            </View>
          </Panel>
        ) : (
          <PressableScale accessibilityRole="button" onPress={pickDocument} style={styles.dropzone}>
            <FileUp size={22} color={colors.textTitle} />
            <Text variant="strong">Scegli un documento</Text>
            <Text variant="caption">PDF, Word o testo, fino a 10 MB</Text>
          </PressableScale>
        ))}

      {value.mode !== 'prompt' && (
        <FieldCard
          label="Cosa ti ha colpito (facoltativo)"
          value={value.note}
          onChangeText={(note) => set({ note })}
          multiline
          placeholder="Es. non sono d’accordo sul fatto che serva un team dedicato"
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0, gap: 2 },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fileIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSunken,
  },
  dropzone: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 28,
    paddingHorizontal: 16,
    borderRadius: radii.xl,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.borderField,
    backgroundColor: colors.surfaceCard,
  },
});
