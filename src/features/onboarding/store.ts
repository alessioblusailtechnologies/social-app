import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { applyPatch, type BrandDraft, type BrandKind, type SectionKey, type SectionPatch } from '@/domain/brand';
import { changeDraftKind, createEmptyDraft } from '@/domain/catalog';
import { ONBOARDING_SECTION_KEYS } from '@/domain/sections';
import { createThemes } from '@/domain/themes';
import type { WebsiteInsights } from '@/services/types';

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
  goTo: (index: number) => void;
  next: () => void;
  back: () => void;
  chooseKind: (kind: BrandKind) => void;
  patch: (patch: SectionPatch) => void;
  applyInsights: (insights: WebsiteInsights) => void;
  reset: () => void;
}

const INITIAL = {
  stepIndex: 0,
  direction: 1 as const,
  draft: null,
  insights: null,
  themesEdited: false,
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
          const { draft } = state;
          if (!draft) return {};
          return {
            insights,
            draft: {
              ...draft,
              positioning: {
                ...draft.positioning,
                audiences: [...new Set([...draft.positioning.audiences, ...insights.audiences])],
              },
              themes: state.themesEdited ? draft.themes : createThemes(insights.themes),
              visual:
                draft.visual.palette.origin === 'custom' ? draft.visual : { ...draft.visual, palette: insights.palette },
            },
          };
        }),
      reset: () => set(INITIAL),
    }),
    {
      name: 'presenza/onboarding/v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ stepIndex, draft, insights, themesEdited }) => ({ stepIndex, draft, insights, themesEdited }),
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
