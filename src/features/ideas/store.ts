import { create } from 'zustand';

export type IdeasView = 'proposals' | 'saved';

interface IdeasViewState {
  view: IdeasView;
  /** Filtro per tema; nullo mostra tutti i temi. */
  themeId: string | null;
  setView: (view: IdeasView) => void;
  setThemeId: (themeId: string | null) => void;
}

/** Stato di navigazione della sezione Idee, condiviso con la modale di creazione. */
export const useIdeasView = create<IdeasViewState>()((set) => ({
  view: 'proposals',
  themeId: null,
  setView: (view) => set({ view }),
  setThemeId: (themeId) => set({ themeId }),
}));
