import type { BrandDraft, SectionKey, SectionPatch } from '@shared/domain/brand';

import { ChannelsEditor } from './ChannelsEditor';
import { IdentityEditor } from './IdentityEditor';
import { PositioningEditor } from './PositioningEditor';
import { ReferencesEditor } from './ReferencesEditor';
import { ThemesEditor } from './ThemesEditor';
import type { EditorContext } from './types';
import { VisualEditor } from './VisualEditor';
import { VoiceEditor } from './VoiceEditor';

export { BrandAvatar, ChannelMark, Swatches } from './BrandVisuals';
export { positioningSource } from './PositioningEditor';

export interface SectionEditorProps extends Omit<EditorContext, 'draft'> {
  sectionKey: SectionKey;
  draft: BrandDraft;
  onPatch: (patch: SectionPatch) => void;
}

/** Lo stesso editor serve l'onboarding (un passo) e il Profilo (una modifica). */
export function SectionEditor({ sectionKey, draft, onPatch, ...rest }: SectionEditorProps) {
  const context: EditorContext = { draft, ...rest };
  switch (sectionKey) {
    case 'identity':
      return <IdentityEditor value={draft.identity} onChange={(value) => onPatch({ key: 'identity', value })} context={context} />;
    case 'positioning':
      return (
        <PositioningEditor
          value={draft.positioning}
          onChange={(value) => onPatch({ key: 'positioning', value })}
          context={context}
        />
      );
    case 'channels':
      return <ChannelsEditor value={draft.channels} onChange={(value) => onPatch({ key: 'channels', value })} context={context} />;
    case 'themes':
      return <ThemesEditor value={draft.themes} onChange={(value) => onPatch({ key: 'themes', value })} context={context} />;
    case 'voice':
      return <VoiceEditor value={draft.voice} onChange={(value) => onPatch({ key: 'voice', value })} context={context} />;
    case 'visual':
      return <VisualEditor value={draft.visual} onChange={(value) => onPatch({ key: 'visual', value })} context={context} />;
    case 'references':
      return (
        <ReferencesEditor
          value={draft.references}
          onChange={(value) => onPatch({ key: 'references', value })}
          context={context}
        />
      );
  }
}
