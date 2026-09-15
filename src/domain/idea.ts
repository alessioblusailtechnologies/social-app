import type { ChannelId } from './brand';

/**
 * Un'idea è il punto di partenza di un contenuto: una frase, un taglio e il motivo
 * per cui ha senso per quel brand adesso. La propone l'app dal Brand DNA oppure
 * nasce da una fonte dell'utente (una nota, un link, un documento).
 */

export type IdeaSignalKind =
  | 'theme'
  | 'trend'
  | 'recurrence'
  | 'season'
  | 'network'
  | 'prompt'
  | 'link'
  | 'document';

export type IdeaFormat = 'post' | 'carousel' | 'video' | 'article';

export type IdeaStatus = 'new' | 'saved' | 'discarded';

export type IdeaSource =
  | { kind: 'prompt'; text: string }
  | { kind: 'link'; url: string; note: string }
  | { kind: 'document'; name: string; size: number | null; note: string };

export interface IdeaDraft {
  /** L'idea in una frase. */
  title: string;
  /** Il taglio, es. "Il caso con i numeri". */
  angleLabel: string;
  /** Come svilupparla, in due o tre frasi. */
  angle: string;
  /** Perché ha senso per questo brand, adesso. */
  rationale: string;
  themeId: string | null;
  signal: { kind: IdeaSignalKind; label: string };
  /** Nullo per le proposte automatiche. */
  source: IdeaSource | null;
  formats: IdeaFormat[];
  channels: ChannelId[];
}

export interface Idea extends IdeaDraft {
  id: string;
  brandId: string;
  createdAt: string;
  status: IdeaStatus;
  /** Quando è stata salvata o scartata. */
  decidedAt: string | null;
}

export const SIGNAL_LABELS: Record<IdeaSignalKind, string> = {
  theme: 'Tema',
  trend: 'Trend',
  recurrence: 'Ricorrenza',
  season: 'Stagione',
  network: 'Rete',
  prompt: 'Tua',
  link: 'Da un link',
  document: 'Da un documento',
};

export const FORMAT_LABELS: Record<IdeaFormat, string> = {
  post: 'Post',
  carousel: 'Carosello',
  video: 'Video breve',
  article: 'Articolo',
};

/**
 * Cosa insegnano le scelte dell'utente: ogni idea tenuta vale +1 per il suo tema
 * e il suo segnale, ogni idea scartata -0,5.
 */
export function ideaPreferences(ideas: readonly Idea[]) {
  const decided = ideas.filter((idea) => idea.status !== 'new');
  const score = (keyOf: (idea: Idea) => string | null) => {
    const scores = new Map<string, number>();
    for (const idea of decided) {
      const key = keyOf(idea);
      if (key) scores.set(key, (scores.get(key) ?? 0) + (idea.status === 'saved' ? 1 : -0.5));
    }
    return scores;
  };
  return {
    decided: decided.length,
    saved: decided.filter((idea) => idea.status === 'saved').length,
    themeScores: score((idea) => idea.themeId),
    signalScores: score((idea) => idea.signal.kind),
  };
}

export function topScore(scores: Map<string, number>): string | null {
  let best: string | null = null;
  let bestScore = 0;
  for (const [key, value] of scores) {
    if (value > bestScore) {
      best = key;
      bestScore = value;
    }
  }
  return best;
}
