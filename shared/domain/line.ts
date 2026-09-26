import type { BrandLine, BrandTemplate, ChannelId, LineFont } from './brand';
import { lineFontOption } from './catalog';
import { clip, type TemplateId, type VisualDesign } from './visual';

/**
 * La linea grafica del brand e i suoi template: il direttore artistico li scrive nel passo «Come appare» guardando i
 * riferimenti, il motore delle card (`src/templates`) li disegna. Qui sta quello che backend, mock e app fanno uguale:
 * quando una linea si corregge o si rifà, la pulizia dei template, il loro uso nei visivi dei post.
 */

/**
 * Se un'indicazione corregge la linea di prima: solo se la linea è nata dagli stessi riferimenti di adesso. Con
 * riferimenti nuovi (o una linea di cui non si sa da dove viene, se ora ci sono riferimenti) si fa una linea nuova.
 */
export function sameReferences(line: BrandLine | null | undefined, references: readonly (string | null | undefined)[]): boolean {
  const now = [...new Set(references.filter((path): path is string => Boolean(path)))].sort();
  if (!line?.from) return now.length === 0;
  const before = [...new Set(line.from)].sort();
  return before.length === now.length && before.every((path, i) => path === now[i]);
}

/** Quante card d'esempio e in che formato: una per canale, almeno tre per vedere un pezzo di feed, al massimo cinque. */
export function exampleChannels(channels: readonly ChannelId[]): ChannelId[] {
  const list = channels.length > 0 ? [...new Set(channels)] : (['instagram'] as ChannelId[]);
  const count = Math.min(5, Math.max(3, list.length));
  return Array.from({ length: count }, (_, i) => list[i % list.length]);
}

/** I caratteri della linea di base, a parole: la usa chi scrive i post quando il brand non ha template suoi. */
export function describeLineFonts(line: BrandLine): string {
  const name = (font: LineFont) => lineFontOption(font.font)?.family ?? font.font;
  const voice = `${name(line.voice)}${line.voice.italic ? ' corsivo' : ''}`;
  const label = name(line.label);
  return voice === label ? voice : `${voice} per la voce, ${label} per le etichette`;
}

// ---------------------------------------------------------------------------
// I template scritti per il brand
// ---------------------------------------------------------------------------

/** I testi che un template può mostrare: gli stessi della card, così i post li riempiono senza traduzioni. */
export const TEMPLATE_FIELDS = ['kicker', 'headline', 'body', 'value', 'items', 'author'] as const;

const MAX_TEMPLATES = 6;

/**
 * La prima pulizia dei template, sul server: via script, frame, link, stili incorporati e attributi on*. La seconda,
 * completa, la fa il motore quando disegna (`src/templates/custom.tsx`).
 */
export function cleanTemplates(raw: readonly BrandTemplate[]): BrandTemplate[] {
  const seen = new Set<string>();
  return raw
    .map((template, index) => {
      const base = template.id.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || `template-${index + 1}`;
      let id = base.slice(0, 40);
      for (let n = 2; seen.has(id); n++) id = `${base.slice(0, 36)}-${n}`;
      seen.add(id);
      const html = template.html
        .replace(/<(script|style|iframe|object|embed|link|meta|base|form|input|button|textarea|select)\b[\s\S]*?(<\/\1>|\/?>)/gi, '')
        .replace(/\s on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/javascript:/gi, '');
      return {
        id,
        name: clip(template.name.replace(/\s+/g, ' ').trim(), 60) || `Template ${index + 1}`,
        use: clip(template.use.replace(/\s+/g, ' ').trim(), 400),
        fields: template.fields.filter((field) => (TEMPLATE_FIELDS as readonly string[]).includes(field)),
        photo: Boolean(template.photo),
        html: html.slice(0, 20_000),
        css: template.css.replace(/@import[^;]*;?/gi, '').slice(0, 30_000),
      };
    })
    .filter((template) => template.html.trim())
    .slice(0, MAX_TEMPLATES);
}

/** Il layout del motore che fa le veci di un template del brand, dove serve un layout (foto da fare, riserva). */
export function templateFallback(template: Pick<BrandTemplate, 'photo' | 'fields'>): TemplateId {
  if (template.photo) return 'photo-cover';
  if (template.fields.includes('items')) return 'list';
  return 'statement';
}

/**
 * Un visivo coi template del brand: la copertina usa quello scelto (o il primo adatto al tipo del visivo), le slide di
 * un carosello un template di testo del brand. Senza template del brand il visivo resta com'è.
 */
export function withBrandTemplates(design: VisualDesign | null, templates: readonly BrandTemplate[], chosenId?: string): VisualDesign | null {
  if (!design || templates.length === 0) return design;
  const wantsPhoto = design.kind !== 'infographic';
  const cover =
    (chosenId ? templates.find((template) => template.id === chosenId) : undefined) ??
    templates.find((template) => template.photo === wantsPhoto) ??
    templates[0];
  const slide = templates.find((template) => !template.photo && template.fields.includes('headline'));
  return {
    ...design,
    kind: cover.photo ? (design.kind === 'infographic' ? 'photo' : design.kind) : 'infographic',
    pages: design.pages.map((page, index) =>
      index === 0
        ? { ...page, templateId: templateFallback(cover), custom: cover.id }
        : slide
          ? { ...page, templateId: templateFallback(slide), custom: slide.id }
          : page,
    ),
  };
}
