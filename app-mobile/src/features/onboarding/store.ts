import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { applyPatch, type BrandDraft, type BrandKind, type SectionKey, type SectionPatch } from '@shared/domain/brand';
import { changeDraftKind, createEmptyDraft } from '@shared/domain/catalog';
import { ONBOARDING_SECTION_KEYS } from '@shared/domain/sections';
import { createThemes } from '@shared/domain/themes';
import type { PositioningIdeas, WebsiteInsights } from '@shared/services/types';

export type OnboardingStep = 'intro' | SectionKey | 'summary';

export const ONBOARDING_STEPS: OnboardingStep[] = ['intro', ...ONBOARDING_SECTION_KEYS, 'summary'];

interface OnboardingState {
  stepIndex: number;
  /** Verso dell'ultima transizione, per animare avanti e indietro. */
  direction: 1 | -1;
  /** Nullo finché non si sceglie per chi costruire la presenza. */
  draft: BrandDraft | null;
  insights: WebsiteInsights | null;
  /** Dopo che l'utente ha toccato i temi, la lettura del sito non li sovrascrive più. */
  themesEdited: boolean;
  /** Obiettivi e pubblico proposti dall'AI, con il contesto (`key`) da cui vengono. */
  positioningIdeas: { key: string; ideas: PositioningIdeas } | null;
  goTo: (index: number) => void;
  next: () => void;
  back: () => void;
  chooseKind: (kind: BrandKind) => void;
  patch: (patch: SectionPatch) => void;
  applyInsights: (insights: WebsiteInsights) => void;
  applyPositioningIdeas: (key: string, ideas: PositioningIdeas) => void;
  reset: () => void;
}

const INITIAL = {
  stepIndex: 0,
  direction: 1 as const,
  draft: null,
  insights: null,
  themesEdited: false,
  positioningIdeas: null,
};

const clampStep = (index: number) => Math.max(0, Math.min(ONBOARDING_STEPS.length - 1, index));

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      ...INITIAL,
      goTo: (index) =>
        set((state) => ({ stepIndex: clampStep(index), direction: index >= state.stepIndex ? 1 : -1 })),
      next: () => set((state) => ({ stepIndex: clampStep(state.stepIndex + 1), direction: 1 })),
      back: () => set((state) => ({ stepIndex: clampStep(state.stepIndex - 1), direction: -1 })),
      chooseKind: (kind) =>
        set((state) => ({ draft: state.draft ? changeDraftKind(state.draft, kind) : createEmptyDraft(kind) })),
      patch: (patch) =>
        set((state) =>
          state.draft
            ? {
                draft: applyPatch(state.draft, patch),
                themesEdited: state.themesEdited || patch.key === 'themes',
              }
            : {},
        ),
      applyInsights: (insights) =>
        set((state) => {
          const current = state.draft;
          if (!current) return {};
          // Il sito di un altro brand: quello che veniva dal brand di prima (temi, obiettivi, voce, logo, linea,
          // esempi, riferimenti) si butta. Restano il tipo, i dati che l'utente sta scrivendo e i canali.
          const otherBrand = state.insights !== null && state.insights.site !== insights.site;
          const draft = otherBrand
            ? { ...createEmptyDraft(current.identity.kind), identity: current.identity, channels: current.channels }
            : current;
          const themesEdited = otherBrand ? false : state.themesEdited;
          // La frase letta dal sito entra solo al posto di un campo vuoto o della proposta precedente.
          const { pitch } = draft.identity;
          const pitchFree = !pitch.trim() || pitch === state.insights?.pitch;
          return {
            insights,
            themesEdited,
            positioningIdeas: otherBrand ? null : state.positioningIdeas,
            draft: {
              ...draft,
              identity: pitchFree && insights.pitch ? { ...draft.identity, pitch: insights.pitch } : draft.identity,
              themes: themesEdited ? draft.themes : createThemes(insights.themes),
              visual:
                draft.visual.palette.origin === 'custom' ? draft.visual : { ...draft.visual, palette: insights.palette },
            },
          };
        }),
      // Le scelte dell'AI entrano solo dove l'utente non ha ancora scelto, e una volta per contesto.
      applyPositioningIdeas: (key, ideas) =>
        set((state) => {
          const { draft } = state;
          if (!draft || state.positioningIdeas?.key === key) return {};
          const { goals, audiences } = draft.positioning;
          return {
            positioningIdeas: { key, ideas },
            draft: {
              ...draft,
              positioning: {
                ...draft.positioning,
                goals: goals.length > 0 ? goals : ideas.picked.goals,
                audiences: audiences.length > 0 ? audiences : ideas.picked.audiences,
              },
            },
          };
        }),
      reset: () => set(INITIAL),
    }),
    {
      name: 'presenza/onboarding/v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ stepIndex, draft, insights, themesEdited, positioningIdeas }) => ({
        stepIndex,
        draft,
        insights,
        themesEdited,
        positioningIdeas,
      }),
    },
  ),
);

/** L'onboarding riprende da dove era rimasto: aspetta di aver riletto la bozza. */
export function useOnboardingHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() => useOnboardingStore.persist.hasHydrated());
  useEffect(() => {
    const unsubscribe = useOnboardingStore.persist.onFinishHydration(() => setHydrated(true));
    if (useOnboardingStore.persist.hasHydrated()) setHydrated(true);
    return unsubscribe;
  }, []);
  return hydrated;
}
