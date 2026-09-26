import { useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import {
  Badge,
  Button,
  CheckboxMark,
  Dot,
  FormScrollView,
  IconButton,
  KeyboardScreen,
  LinkButton,
  Panel,
  PressableScale,
  ScreenFooter,
  ScreenTitle,
  SkeletonLines,
  Text,
  TopBar,
  colors,
  radii,
  screenStyles,
  useToast,
} from '@/design-system';
import type { Brand } from '@shared/domain/brand';
import type { IdeaDraft } from '@shared/domain/idea';
import { useAddIdeaToPlan, useDraftIdeas, useSaveIdeas } from '@/services/queries';

import { EMPTY_SOURCE, SOURCE_REASONS, SourceFields, sourceFromState, type SourceState } from './SourceFields';
import { useIdeasView } from './store';

export function NewIdeaScreen({ brand }: { brand: Brand }) {
  const router = useRouter();
  const toast = useToast();
  const setView = useIdeasView((state) => state.setView);
  const draftIdeas = useDraftIdeas(brand.id);
  const saveIdeas = useSaveIdeas(brand.id);
  const addToPlan = useAddIdeaToPlan(brand.id);

  const [sourceState, setSourceState] = useState<SourceState>(EMPTY_SOURCE);
  const [variant, setVariant] = useState(0);
  const [drafts, setDrafts] = useState<IdeaDraft[] | null>(null);
  const [selected, setSelected] = useState<number[]>([]);

  const source = sourceFromState(sourceState);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/ideas'));

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
      for (const idea of created) await addToPlan.mutateAsync({ ideaId: idea.id });
      toast(created.length === 1 ? 'Idea salvata e messa nel piano.' : `${created.length} idee salvate e messe nel piano.`);
      router.dismissTo('/plan');
    } catch {
      toast('Salvataggio non riuscito. Riprova.');
    }
  };

  const toggle = (index: number) =>
    setSelected(selected.includes(index) ? selected.filter((i) => i !== index) : [...selected, index]);

  const reading =
    sourceState.mode === 'prompt'
      ? 'Sto leggendo la tua nota'
      : sourceState.mode === 'link'
        ? 'Sto leggendo il link'
        : `Sto leggendo ${sourceState.file?.name ?? 'il documento'}`;

  return (
    <KeyboardScreen>
      <TopBar
        safeArea={Platform.OS !== 'ios'}
        title="Nuova idea"
        right={<IconButton icon={X} accessibilityLabel="Chiudi" onPress={close} />}
      />

      <FormScrollView contentContainerStyle={screenStyles.content}>
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
            <SourceFields
              value={sourceState}
              onChange={setSourceState}
              promptLabel="Di cosa vuoi parlare"
              promptPlaceholder="Es. da marzo il controllo fatture lo fa un modello: prima servivano tre giorni al mese di due persone"
            />
          </>
        ) : (
          <>
            <ScreenTitle
              title="Tre spunti"
              subtitle="Scegli quelli che ti convincono: puoi metterli subito nel piano o tenerli tra le idee."
            />
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
      </FormScrollView>

      <ScreenFooter>
        {drafts === null || draftIdeas.isPending ? (
          <Button
            size="lg"
            block
            disabled={!source}
            busy={draftIdeas.isPending}
            onDisabledPress={() => toast(SOURCE_REASONS[sourceState.mode])}
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
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  bigPanel: { borderRadius: radii.card },
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
