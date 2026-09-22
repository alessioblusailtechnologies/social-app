import { useRouter } from 'expo-router';
import { ChevronLeft, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInLeft, FadeInRight } from 'react-native-reanimated';

import { DEMO_MODE } from '@/config';
import {
  Button,
  FormScrollView,
  IconButton,
  KeyboardScreen,
  ProgressSegments,
  ScreenFooter,
  ScreenTitle,
  Text,
  TopBar,
  motion,
  screenStyles,
  standardEasing,
  useToast,
} from '@/design-system';
import type { BrandKind, SectionKey } from '@/domain/brand';
import { isSkippable, sectionCopy, sectionError } from '@/domain/sections';
import { positioningSource, SectionEditor } from '@/features/brand-editors';
import { useActiveBrand, useCreateBrand, useLoadDemoBrand, usePrefetchPositioningIdeas } from '@/services/queries';

import { IntroStep } from './IntroStep';
import { ONBOARDING_STEPS, useOnboardingHydrated, useOnboardingStore, type OnboardingStep } from './store';
import { SummaryStep } from './SummaryStep';

function stepCopy(step: OnboardingStep, kind: BrandKind, name: string) {
  if (step === 'intro') {
    return {
      title: 'Ciao, costruiamo la tua presenza',
      subtitle: 'Prima di generare qualsiasi cosa mi serve sapere per chi scrivo e come. Poi lavoro da solo.',
    };
  }
  if (step === 'summary') {
    const firstName = name.trim().split(/\s+/)[0];
    return {
      title: kind === 'person' && firstName ? `Tutto pronto, ${firstName}` : 'Tutto pronto',
      subtitle: 'Ecco cosa ho capito. Controlla e creiamo il profilo.',
    };
  }
  return sectionCopy(step, kind);
}

export function OnboardingFlow({ mode }: { mode: 'first' | 'new' }) {
  const router = useRouter();
  const toast = useToast();
  const hydrated = useOnboardingHydrated();
  const {
    stepIndex,
    direction,
    draft,
    insights,
    positioningIdeas,
    next,
    back,
    goTo,
    chooseKind,
    patch,
    applyInsights,
    applyPositioningIdeas,
    reset,
  } = useOnboardingStore();
  const { brand } = useActiveBrand();
  const createBrand = useCreateBrand();
  const loadDemo = useLoadDemoBrand();
  const prefetchPositioning = usePrefetchPositioningIdeas();
  const [createdBrandId, setCreatedBrandId] = useState<string | null>(null);

  // Si entra nel Profilo solo quando il nuovo brand risulta attivo, così la guardia delle route lo lascia passare.
  useEffect(() => {
    if (!createdBrandId || brand?.id !== createdBrandId) return;
    reset();
    if (mode === 'new') router.dismissTo('/profile');
    else router.replace('/profile');
  }, [createdBrandId, brand?.id, mode, reset, router]);

  // Una bozza persa (storage azzerato) riporta al primo passo.
  useEffect(() => {
    if (hydrated && !draft && stepIndex !== 0) goTo(0);
  }, [hydrated, draft, stepIndex, goTo]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stepIndex === 0) return false;
      back();
      return true;
    });
    return () => subscription.remove();
  }, [stepIndex, back]);

  if (!hydrated) return <View style={screenStyles.screen} />;

  const step: OnboardingStep = draft ? ONBOARDING_STEPS[stepIndex] : 'intro';
  const kind = draft?.identity.kind ?? 'person';
  const { title, subtitle } = stepCopy(step, kind, draft?.identity.name ?? '');
  const sectionStep: SectionKey | null = step === 'intro' || step === 'summary' ? null : step;
  const error = sectionStep && draft ? sectionError(sectionStep, draft) : null;
  const busy = createBrand.isPending || loadDemo.isPending || createdBrandId !== null;

  // Obiettivi e pubblico si preparano mentre si passa al passo dopo il sito.
  function goNext() {
    const source = step === 'identity' && draft ? positioningSource(draft.identity, insights) : null;
    if (draft && source && positioningIdeas?.key !== source.key) void prefetchPositioning(draft.identity, source);
    next();
  }

  const primary =
    step === 'intro'
      ? { label: 'Iniziamo', disabled: !draft, reason: 'Scegli per chi costruiamo la presenza.', onPress: next }
      : step === 'summary'
        ? {
            label: busy ? 'Sto preparando il profilo…' : 'Crea il profilo',
            disabled: false,
            reason: '',
            onPress: () =>
              draft &&
              createBrand.mutate(draft, {
                onSuccess: (created) => setCreatedBrandId(created.id),
                onError: () => toast('Non sono riuscito a creare il profilo. Riprova.'),
              }),
          }
        : { label: 'Continua', disabled: error !== null, reason: error ?? '', onPress: goNext };

  return (
    <KeyboardScreen>
      <TopBar
        left={
          stepIndex > 0 && draft ? (
            <IconButton icon={ChevronLeft} accessibilityLabel="Passo precedente" onPress={back} />
          ) : mode === 'new' ? (
            <IconButton icon={X} accessibilityLabel="Chiudi" onPress={() => router.back()} />
          ) : undefined
        }
        title={step === 'intro' ? 'Configurazione' : `Passo ${stepIndex} di ${ONBOARDING_STEPS.length - 1}`}
        right={
          sectionStep && isSkippable(sectionStep) ? (
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              style={styles.skip}
              onPress={() => {
                toast('Saltato: lo ritrovi nel Profilo.');
                next();
              }}>
              <Text variant="caption" weight="medium">
                Lo faccio dopo
              </Text>
            </Pressable>
          ) : undefined
        }>
        <ProgressSegments count={ONBOARDING_STEPS.length} current={draft ? stepIndex : 0} />
      </TopBar>

      <FormScrollView key={step} contentContainerStyle={screenStyles.content}>
        <Animated.View
          entering={(direction === 1 ? FadeInRight : FadeInLeft).duration(motion.slow).easing(standardEasing)}
          style={styles.body}>
          <ScreenTitle title={title} subtitle={subtitle} />
          {step === 'intro' && <IntroStep kind={draft?.identity.kind ?? null} onChoose={chooseKind} />}
          {step === 'summary' && draft && (
            <SummaryStep draft={draft} onEdit={(key) => goTo(ONBOARDING_STEPS.indexOf(key))} />
          )}
          {sectionStep && draft && (
            <SectionEditor
              sectionKey={sectionStep}
              draft={draft}
              onPatch={patch}
              insights={insights}
              onInsights={applyInsights}
              positioningIdeas={positioningIdeas}
              onPositioningIdeas={applyPositioningIdeas}
            />
          )}
        </Animated.View>
      </FormScrollView>

      <ScreenFooter>
        <Button
          size="lg"
          block
          variant={step === 'summary' ? 'accent' : 'primary'}
          disabled={primary.disabled}
          busy={busy}
          onDisabledPress={() => toast(primary.reason)}
          onPress={primary.onPress}>
          {primary.label}
        </Button>
        {step === 'intro' && mode === 'first' && DEMO_MODE && (
          <Button
            variant="ghost"
            block
            busy={busy}
            onPress={() =>
              loadDemo.mutate(undefined, {
                onSuccess: (demo) => setCreatedBrandId(demo.id),
                onError: () => toast('Non riesco a caricare il profilo di esempio.'),
              })
            }>
            {loadDemo.isPending ? 'Preparo il profilo di esempio…' : 'Esplora con un profilo di esempio'}
          </Button>
        )}
      </ScreenFooter>
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  body: { gap: 14 },
  skip: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 4 },
});
