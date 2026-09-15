import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';

import {
  Badge,
  Button,
  IconButton,
  ScreenFooter,
  ScreenTitle,
  TopBar,
  screenStyles,
  useToast,
} from '@/design-system';
import { applyPatch, type Brand, type BrandDraft, type SectionKey, type SectionPatch } from '@/domain/brand';
import { sectionCopy, sectionError } from '@/domain/sections';
import { SectionEditor } from '@/features/brand-editors';
import { useUpdateSection } from '@/services/queries';

export function SectionEditScreen({ brand, sectionKey }: { brand: Brand; sectionKey: SectionKey }) {
  const router = useRouter();
  const toast = useToast();
  const update = useUpdateSection();
  const [draft, setDraft] = useState<BrandDraft>(brand);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const { title, subtitle } = sectionCopy(sectionKey, draft.identity.kind);
  const dirty = JSON.stringify(draft[sectionKey]) !== JSON.stringify(brand[sectionKey]);
  const error = sectionError(sectionKey, draft);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/profile'));

  // Niente finestre di dialogo: con modifiche in sospeso il primo "indietro" avvisa, il secondo scarta.
  const goBack = () => {
    if (dirty && !confirmLeave) {
      setConfirmLeave(true);
      toast('Hai modifiche non salvate: tocca di nuovo indietro per scartarle.');
      return;
    }
    close();
  };

  const save = () =>
    update.mutate(
      { brandId: brand.id, patch: { key: sectionKey, value: draft[sectionKey] } as SectionPatch },
      {
        onSuccess: () => {
          toast('Modifiche salvate.');
          close();
        },
        onError: () => toast('Salvataggio non riuscito. Riprova.'),
      },
    );

  return (
    <KeyboardAvoidingView style={screenStyles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <TopBar
        left={<IconButton icon={ChevronLeft} accessibilityLabel="Torna al profilo" onPress={goBack} />}
        title={`Profilo · ${brand.identity.name}`}
        right={
          dirty ? (
            <Badge tone="yellow" size="sm">
              Da salvare
            </Badge>
          ) : undefined
        }
      />
      <ScrollView contentContainerStyle={screenStyles.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title={title} subtitle={subtitle} />
        <SectionEditor
          sectionKey={sectionKey}
          draft={draft}
          insights={null}
          onPatch={(patch) => {
            setConfirmLeave(false);
            setDraft((current) => applyPatch(current, patch));
          }}
        />
      </ScrollView>
      <ScreenFooter>
        <Button
          size="lg"
          block
          disabled={!dirty || error !== null}
          busy={update.isPending}
          onDisabledPress={() => toast(error ?? 'Nessuna modifica da salvare.')}
          onPress={save}>
          {update.isPending ? 'Salvo…' : 'Salva'}
        </Button>
      </ScreenFooter>
    </KeyboardAvoidingView>
  );
}
