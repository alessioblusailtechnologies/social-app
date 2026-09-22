import type { Brand, ImageStyle } from '@/domain/brand';
import type { ImageRole } from '@/domain/visual';

/**
 * Il prompt della foto per il modello d'immagine, in inglese. La descrizione (scritta dall'AI della bozza o
 * dall'utente) dice cosa si vede; lo stile viene dal Brand DNA ed è lo stesso per ogni post del brand. Il testo
 * non entra mai nella foto: sta nei template.
 */

const STYLE: Record<ImageStyle, string> = {
  'natural-photo':
    'Style: natural documentary photography, real daylight, true-to-life colors, soft shadows, gentle depth of field.',
  'desaturated-photo':
    'Style: editorial photography with muted, desaturated tones, soft contrast and a calm, understated mood.',
  'flat-geometric': 'Style: clean, minimal photography with simple shapes, an uncluttered composition and soft, even light.',
  'text-only': 'Style: clean, minimal photography with an uncluttered composition and soft, even light.',
};

export interface PhotoPromptInput {
  /** Cosa si vede, di solito in italiano. */
  description: string;
  role: ImageRole;
  aspectRatio: string;
  brand: { identity: Pick<Brand['identity'], 'kind'>; visual: Pick<Brand['visual'], 'imageStyle' | 'palette' | 'direction'> };
  /** Quante foto del brand arrivano insieme, come riferimento di stile. */
  references: number;
}

export function photoPrompt({ description, role, aspectRatio, brand, references }: PhotoPromptInput): string {
  const palette = brand.visual.palette.colors.join(', ');
  return [
    role === 'cutout'
      ? `A photograph of one single subject, shown whole and centered, isolated on a plain seamless light neutral background, with generous empty space around it and no cast shadows, so that it can be cut out cleanly. Aspect ratio ${aspectRatio}.`
      : `A photograph for a social media post. Aspect ratio ${aspectRatio}. Keep a calm, uncluttered area where a headline can be placed later.`,
    `What the photo shows (described in Italian): ${description.trim()}`,
    STYLE[brand.visual.imageStyle],
    // Lo stile ricavato dalle immagini di riferimento del brand, quando c'è.
    brand.visual.direction?.photoStyle ? `Brand photo style: ${brand.visual.direction.photoStyle}` : '',
    role === 'cutout'
      ? `Light and colors of the subject in harmony with the brand palette ${palette}; keep the background plain and neutral.`
      : `Color grading: tones that harmonize with the brand palette ${palette}, used for light and ambience, not as brightly colored objects or props.`,
    // Il modello tende a mettere un volto anche quando non serve: la regola va detta come inquadratura.
    brand.identity.kind === 'person'
      ? 'No faces at all: show objects, hands, workspaces or environments. If a person appears, frame only hands and arms, with the head completely outside the frame.'
      : 'No faces at all: if people appear, frame them so the head is completely outside the frame (hands, arms, torso), or show them from behind.',
    references > 0
      ? `${references === 1 ? 'The attached image is a reference' : `The ${references} attached images are references`} for this brand's photographic look: match their lighting, color grading, contrast and photographic rendering, but do not copy their subjects, composition, text or logos.`
      : '',
    'One single full-bleed photograph that fills the whole image edge to edge: no borders, frames, mats, margins, panels, cards or backgrounds around it, no collage, no interface.',
    'No text, no letters, no numbers, no logos, no watermarks.',
  ]
    .filter(Boolean)
    .join('\n');
}
