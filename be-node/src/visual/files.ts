import { randomUUID } from 'node:crypto';

import type { Content, ContentVisual } from '@/domain/content';
import type { MediaFile, VisualDesign } from '@/domain/visual';

import type { MediaStorage } from '../media/storage';

/**
 * I file di un visivo (foto, scontorno, PNG). Nel database c'è solo il percorso: l'indirizzo firmato si mette
 * quando l'API restituisce il contenuto, perché scade.
 */

export const MEDIA_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/** Un file nuovo per ogni versione, `account/brand/uuid.ext`: nessuna cache mostra quello vecchio. */
export function mediaPath(accountId: string, brandId: string, mimeType: string): string {
  return `${accountId}/${brandId}/${randomUUID()}.${MEDIA_EXTENSIONS[mimeType] ?? 'bin'}`;
}

export function mapDesignFiles(design: VisualDesign, change: (file: MediaFile) => MediaFile): VisualDesign {
  const map = (file: MediaFile | null) => (file ? change(file) : null);
  return {
    ...design,
    image: { ...design.image, photo: map(design.image.photo), cutout: map(design.image.cutout) },
    renders: design.renders.map((render) => ({ ...render, file: change(render.file) })),
  };
}

export function designPaths(design: VisualDesign | null | undefined): string[] {
  if (!design) return [];
  return [design.image.photo, design.image.cutout, ...design.renders.map((render) => render.file)]
    .map((file) => file?.path)
    .filter((path): path is string => Boolean(path));
}

/** Nel database l'indirizzo resta vuoto; le bozze nate prima dei visivi hanno `design` nullo. */
export function unsignedVisual(visual: ContentVisual): ContentVisual {
  const design = visual.design ?? null;
  return { ...visual, design: design && mapDesignFiles(design, (file) => (file.path ? { ...file, url: '' } : file)) };
}

/** Firma in un colpo solo tutti i file dei contenuti. Se lo Storage non risponde, i contenuti si leggono lo stesso. */
export async function signContents(storage: MediaStorage, contents: Content[]): Promise<Content[]> {
  const paths = contents.flatMap((content) => designPaths(content.visual.design));
  if (paths.length === 0) return contents;
  let urls: Map<string, string>;
  try {
    urls = await storage.sign(paths);
  } catch {
    return contents;
  }
  return contents.map((content) => {
    const { design } = content.visual;
    if (!design) return content;
    const signed = mapDesignFiles(design, (file) => (file.path ? { ...file, url: urls.get(file.path) ?? '' } : file));
    return { ...content, visual: { ...content.visual, design: signed } };
  });
}

export async function signContent(storage: MediaStorage, content: Content): Promise<Content> {
  const [signed] = await signContents(storage, [content]);
  return signed;
}
