import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { FileText, FileUp, X } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import {
  Badge,
  Button,
  CheckboxMark,
  Dot,
  FieldCard,
  IconButton,
  LinkButton,
  Panel,
  PressableScale,
  ScreenFooter,
  ScreenTitle,
  SegmentedControl,
  SkeletonLines,
  Text,
  TopBar,
  colors,
  radii,
  screenStyles,
  useToast,
} from '@/design-system';
import type { Brand } from '@/domain/brand';
import type { IdeaDraft, IdeaSource } from '@/domain/idea';
import { useAddIdeaToPlan, useDraftIdeas, useSaveIdeas } from '@/services/queries';

import { useIdeasView } from './store';

type Mode = 'prompt' | 'link' | 'document';

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

const DOCUMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
];

const REASONS: Record<Mode, string> = {
  prompt: 'Scrivi almeno una frase su cosa vuoi dire.',
  link: 'Incolla un link completo, per esempio https://…',
  document: 'Scegli un documento.',
};

const looksLikeUrl = (value: string) => /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(value.trim());

function formatSize(bytes: number): string {
  return bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`;
}

export function NewIdeaScreen({ brand }: { brand: Brand }) {
  const router = useRouter();
  const toast = useToast();
  const setView = useIdeasView((state) => state.setView);
  const draftIdeas = useDraftIdeas(brand.id);
  const saveIdeas = useSaveIdeas(brand.id);
  const addToPlan = useAddIdeaToPlan(brand.id);

  const [mode, setMode] = useState<Mode>('prompt');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<{ name: string; size: number | null } | null>(null);
  const [variant, setVariant] = useState(0);
  const [drafts, setDrafts] = useState<IdeaDraft[] | null>(null);
  const [selected, setSelected] = useState<number[]>([]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/ideas'));

  let source: IdeaSource | null = null;
  if (mode === 'prompt' && text.trim().length >= 12) source = { kind: 'prompt', text: text.trim() };
  if (mode === 'link' && looksLikeUrl(url)) source = { kind: 'link', url: url.trim(), note: note.trim() };
  if (mode === 'document' && file) source = { kind: 'document', name: file.name, size: file.size, note: note.trim() };

  const propose = (nextVariant: number) => {
    if (!source) return;
    draftIdeas.mutate(
      { source, variant: nextVariant },
      {
        onSuccess: (result) => {
          setDrafts(result);
          setSelected(result.map((_, i) => i));
          setVariant(nextVariant);
        },
        onError: () => toast('Non riesco a leggere la fonte. Riprova.'),
      },
    );
  };

  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: DOCUMENT_TYPES, copyToCacheDirectory: false });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset.size && asset.size > MAX_DOCUMENT_BYTES) {
      toast('Il documento supera i 10 MB.');
      return;
    }
    setFile({ name: asset.name, size: asset.size ?? null });
  };

  const saving = saveIdeas.isPending || addToPlan.isPending;

  const save = async (toPlan: boolean) => {
    if (!drafts) return;
    const chosen = drafts.filter((_, i) => selected.includes(i));
    try {
      const created = await saveIdeas.mutateAsync(chosen);
      setView('saved');
      if (!toPlan) {
        toast(created.length === 1 ? 'Idea salvata.' : `${created.length} idee salvate.`);
        close();
        return;
      }
      // In fila: ogni idea trova la sua uscita tenendo conto di quelle appena piazzate.
      for (const idea of created) await addToPlan.mutateAsync(idea.id);
      toast(created.length === 1 ? 'Idea salvata e messa nel piano.' : `${created.length} idee salvate e messe nel piano.`);
      router.dismissTo('/plan');
    } catch {
      toast('Salvataggio non riuscito. Riprova.');
    }
  };

  const toggle = (index: number) =>
    setSelected(selected.includes(index) ? selected.filter((i) => i !== index) : [...selected, index]);

  const reading =
    mode === 'prompt' ? 'Sto leggendo la tua nota' : mode === 'link' ? 'Sto leggendo il link' : `Sto leggendo ${file?.name ?? 'il documento'}`;

  return (
    <KeyboardAvoidingView style={screenStyles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <TopBar
        safeArea={Platform.OS !== 'ios'}
        title="Nuova idea"
        right={<IconButton icon={X} accessibilityLabel="Chiudi" onPress={close} />}
      />

      <ScrollView contentContainerStyle={screenStyles.content} keyboardShouldPersistTaps="handled">
        {draftIdeas.isPending ? (
          <>
            <ScreenTitle title="Un attimo" subtitle="Cerco tre tagli diversi e li lego ai temi del tuo profilo." />
            <Panel gap={12} style={styles.bigPanel}>
              <Text variant="strongSmall">{reading}</Text>
              <SkeletonLines widths={[92, 76, 100, 58]} />
            </Panel>
          </>
        ) : drafts === null ? (
          <>
            <ScreenTitle
              title="Da dove parte l’idea?"
              subtitle="Scrivila come la diresti a un collega, oppure dammi un link o un documento: ti preparo tre spunti con tagli diversi."
            />
            <SegmentedControl
              accessibilityLabel="Fonte dell’idea"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'prompt', label: 'Scrivi' },
                { value: 'link', label: 'Link' },
                { value: 'document', label: 'Documento' },
              ]}
            />

            {mode === 'prompt' && (
              <>
                <FieldCard
                  label="Di cosa vuoi parlare"
                  value={text}
                  onChangeText={setText}
                  multiline
                  autoFocus
                  placeholder="Es. da marzo il controllo fatture lo fa un modello: prima servivano tre giorni al mese di due persone"
                />
                <Text variant="caption" style={screenStyles.groupLabel}>
                  Va bene anche un appunto veloce, o dettato con la tastiera: il resto lo sistemo io.
                </Text>
              </>
            )}

            {mode === 'link' && (
              <FieldCard
                label="Link"
                value={url}
                onChangeText={setUrl}
                placeholder="https://…"
                keyboardType="url"
                autoCapitalize="none"
                autoCorrect={false}
              />
            )}

            {mode === 'document' &&
              (file ? (
                <Panel>
                  <View style={styles.fileRow}>
                    <View style={styles.fileIcon}>
                      <FileText size={18} color={colors.textTitle} />
                    </View>
                    <View style={styles.flex}>
                      <Text variant="strongSmall" numberOfLines={1}>
                        {file.name}
                      </Text>
                      {file.size ? <Text variant="caption">{formatSize(file.size)}</Text> : null}
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

            {mode !== 'prompt' && (
              <FieldCard
                label="Cosa ti ha colpito (facoltativo)"
                value={note}
                onChangeText={setNote}
                multiline
                placeholder="Es. non sono d’accordo sul fatto che serva un team dedicato"
              />
            )}
          </>
        ) : (
          <>
            <ScreenTitle title="Tre spunti" subtitle="Scegli quelli che ti convincono: puoi metterli subito nel piano o tenerli tra le idee." />
            {drafts.map((draft, index) => {
              const checked = selected.includes(index);
              const theme = brand.themes.find((candidate) => candidate.id === draft.themeId);
              return (
                <PressableScale
                  key={`${variant}-${draft.title}`}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  accessibilityLabel={draft.title}
                  onPress={() => toggle(index)}
                  style={[styles.draft, checked && styles.draftChecked]}>
                  <View style={styles.draftHeader}>
                    <CheckboxMark checked={checked} />
                    <Badge tone="neutral" size="sm">
                      {draft.angleLabel}
                    </Badge>
                  </View>
                  <Text variant="heading">{draft.title}</Text>
                  <Text variant="body" color={colors.textTitle} style={styles.lineHeight}>
                    {draft.angle}
                  </Text>
                  {theme && (
                    <View style={styles.themeRow}>
                      <Dot color={theme.color} size={8} />
                      <Text variant="caption">{theme.name}</Text>
                    </View>
                  )}
                </PressableScale>
              );
            })}
            <View style={styles.links}>
              <LinkButton label="Rifai con un altro taglio" onPress={() => propose(variant + 1)} />
              <LinkButton label="Modifica la richiesta" tone="muted" onPress={() => setDrafts(null)} />
            </View>
          </>
        )}
      </ScrollView>

      <ScreenFooter>
        {drafts === null || draftIdeas.isPending ? (
          <Button
            size="lg"
            block
            disabled={!source}
            busy={draftIdeas.isPending}
            onDisabledPress={() => toast(REASONS[mode])}
            onPress={() => propose(0)}>
            {draftIdeas.isPending ? 'Sto leggendo…' : 'Proponi tre idee'}
          </Button>
        ) : (
          <>
            <Button
              size="lg"
              block
              disabled={selected.length === 0}
              busy={saving}
              onDisabledPress={() => toast('Scegli almeno uno spunto.')}
              onPress={() => save(true)}>
              {saving ? 'Salvo…' : 'Metti nel piano'}
            </Button>
            <Button
              variant="ghost"
              block
              disabled={selected.length === 0}
              busy={saving}
              onDisabledPress={() => toast('Scegli almeno uno spunto.')}
              onPress={() => save(false)}>
              {selected.length === 1 ? 'Tienila tra le idee' : `Tienile tra le idee (${selected.length})`}
            </Button>
          </>
        )}
      </ScreenFooter>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0, gap: 2 },
  bigPanel: { borderRadius: radii.card },
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
  draft: {
    gap: 10,
    padding: 16,
    borderRadius: radii.xl,
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: colors.surfaceCard,
  },
  draftChecked: { borderColor: colors.borderStrong },
  draftHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lineHeight: { lineHeight: 19 },
  themeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  links: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 18, paddingHorizontal: 2 },
});
