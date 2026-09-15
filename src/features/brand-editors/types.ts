import type { BrandDraft } from '@/domain/brand';
import type { WebsiteInsights } from '@/services/types';

export interface EditorContext {
  /** Tutta la bozza: alcune sezioni dipendono dalle altre (tipo di brand, canali collegati). */
  draft: BrandDraft;
  insights: WebsiteInsights | null;
  /** Solo in onboarding: la lettura del sito precompila i passi successivi. */
  onInsights?: (insights: WebsiteInsights) => void;
}

export interface EditorProps<T> {
  value: T;
  onChange: (value: T) => void;
  context: EditorContext;
}
