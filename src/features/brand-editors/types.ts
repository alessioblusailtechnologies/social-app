import type { BrandDraft } from '@/domain/brand';
import type { PositioningIdeas, WebsiteInsights } from '@/services/types';

export interface EditorContext {
  /** Tutta la bozza: alcune sezioni dipendono dalle altre (tipo di brand, canali collegati). */
  draft: BrandDraft;
  insights: WebsiteInsights | null;
  /** Solo in onboarding: la lettura del sito precompila i passi successivi. */
  onInsights?: (insights: WebsiteInsights) => void;
  /** Solo in onboarding: obiettivi e pubblico proposti dall'AI, con il contesto da cui vengono. */
  positioningIdeas?: { key: string; ideas: PositioningIdeas } | null;
  onPositioningIdeas?: (key: string, ideas: PositioningIdeas) => void;
}

export interface EditorProps<T> {
  value: T;
  onChange: (value: T) => void;
  context: EditorContext;
}
