import { randomUUID } from 'node:crypto';

import type { Brand, Visual } from '@/domain/brand';
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
  // I file che non nascono dal nostro render: video e audio generati altrove, che finiscono
  // nello stesso bucket e nella stessa cartella del brand.
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/wav': 'wav',
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
    // La foto di una pagina, nei caroselli fatti con le foto vere.
    pages: design.pages.map((page) => (page.photo ? { ...page, photo: change(page.photo) } : page)),
    renders: design.renders.map((render) => ({ ...render, file: change(render.file) })),
  };
}

export function designPaths(design: VisualDesign | null | undefined): string[] {
  if (!design) return [];
  return [design.image.photo, design.image.cutout, ...design.pages.map((page) => page.photo), ...design.renders.map((render) => render.file)]
    .map((file) => file?.path)
    .filter((path): path is string => Boolean(path));
}

/** Tutti i file del visivo di un contenuto: la card, il montaggio, il materiale delle scene. */
function mapVisualFilesOf(visual: ContentVisual, change: (file: MediaFile) => MediaFile): ContentVisual {
  const design = visual.design ?? null;
  const cut = visual.cut ?? null;
  return {
    ...visual,
    design: design && mapDesignFiles(design, change),
    cut: cut && { ...cut, file: change(cut.file) },
    cover: visual.cover && {
      ...visual.cover,
      file: change(visual.cover.file),
      photo: visual.cover.photo && change(visual.cover.photo),
      cutout: visual.cover.cutout && change(visual.cover.cutout),
    },
    scenes: visual.scenes.map((scene) => ({
      ...scene,
      ...(scene.footage && { footage: change(scene.footage) }),
      ...(scene.frame && { frame: change(scene.frame) }),
      ...(scene.clip && { clip: change(scene.clip) }),
    })),
  };
}

function contentPaths(visual: ContentVisual): string[] {
  return [
    ...designPaths(visual.design),
    ...[visual.cut?.file, visual.cover?.file, visual.cover?.photo, visual.cover?.cutout, ...visual.scenes.flatMap((scene) => [scene.footage, scene.frame, scene.clip])]
      .map((file) => file?.path)
      .filter((path): path is string => Boolean(path)),
  ];
}

/** Nel database l'indirizzo resta vuoto; le bozze nate prima dei visivi hanno `design` nullo. */
export function unsignedVisual(visual: ContentVisual): ContentVisual {
  return mapVisualFilesOf({ ...visual, design: visual.design ?? null }, (file) => (file.path ? { ...file, url: '' } : file));
}

/** Firma in un colpo solo tutti i file dei contenuti. Se lo Storage non risponde, i contenuti si leggono lo stesso. */
export async function signContents(storage: MediaStorage, contents: Content[]): Promise<Content[]> {
  const paths = contents.flatMap((content) => contentPaths(content.visual));
  if (paths.length === 0) return contents;
  let urls: Map<string, string>;
  try {
    urls = await storage.sign(paths);
  } catch {
    return contents;
  }
  const sign = (file: MediaFile) => (file.path ? { ...file, url: urls.get(file.path) ?? '' } : file);
  return contents.map((content) =>
    contentPaths(content.visual).length === 0 ? content : { ...content, visual: mapVisualFilesOf(content.visual, sign) },
  );
}

export async function signContent(storage: MediaStorage, content: Content): Promise<Content> {
  const [signed] = await signContents(storage, [content]);
  return signed;
}

// ---------------------------------------------------------------------------
// Il profilo visivo del brand: immagini di riferimento e card di esempio
// ---------------------------------------------------------------------------

/** Riferimenti ed esempi di un profilo che non ha ancora un brand: `account/profilo/uuid.ext`. */
export function profileMediaPath(accountId: string, mimeType: string): string {
  return mediaPath(accountId, 'profilo', mimeType);
}

function mapVisualFiles(visual: Visual, change: (file: MediaFile) => MediaFile): Visual {
  return {
    ...visual,
    ...(visual.references && { references: visual.references.map(change) }),
    ...(visual.examples && {
      examples: visual.examples.map((example) => ({
        ...example,
        file: example.file && change(example.file),
        ...(example.photo && { photo: change(example.photo) }),
      })),
    }),
    ...(visual.line?.band?.photo && { line: { ...visual.line, band: { ...visual.line.band, photo: change(visual.line.band.photo) } } }),
    ...(visual.music && { music: visual.music.map((track) => ({ ...track, file: change(track.file) })) }),
  };
}

function visualPaths(visual: Visual): string[] {
  return [
    ...(visual.references ?? []),
    ...(visual.examples ?? []).flatMap((example) => [example.file, example.photo]),
    visual.line?.band?.photo,
    ...(visual.music ?? []).map((track) => track.file),
  ]
    .map((file) => file?.path)
    .filter((path): path is string => Boolean(path));
}

/**
 * Prima di salvare: niente indirizzi firmati, che scadono, e solo file dell'account. Un percorso di un altro account
 * si firmerebbe alla lettura e ne mostrerebbe i file.
 */
export function storableVisual(accountId: string, visual: Visual): Visual {
  const own = (file: MediaFile | null) => !file?.path || file.path.startsWith(`${accountId}/`);
  const cleaned: Visual = {
    ...visual,
    ...(visual.references && { references: visual.references.filter(own) }),
    ...(visual.examples && { examples: visual.examples.filter((example) => own(example.file) && own(example.photo ?? null)) }),
    ...(visual.music && { music: visual.music.filter((track) => own(track.file)) }),
    // La foto della fascia di un altro account non si tiene: la linea resta, senza foto.
    ...(visual.line?.band && !own(visual.line.band.photo) && { line: { ...visual.line, band: { ...visual.line.band, photo: null } } }),
  };
  return mapVisualFiles(cleaned, (file) => (file.path ? { ...file, url: '' } : file));
}

/** Firma in un colpo solo riferimenti ed esempi dei brand. Se lo Storage non risponde, i brand si leggono lo stesso. */
export async function signBrands(storage: MediaStorage, brands: Brand[]): Promise<Brand[]> {
  const paths = brands.flatMap((brand) => visualPaths(brand.visual));
  if (paths.length === 0) return brands;
  let urls: Map<string, string>;
  try {
    urls = await storage.sign(paths);
  } catch {
    return brands;
  }
  return brands.map((brand) => ({
    ...brand,
    visual: mapVisualFiles(brand.visual, (file) => (file.path ? { ...file, url: urls.get(file.path) ?? '' } : file)),
  }));
}

export async function signBrand(storage: MediaStorage, brand: Brand): Promise<Brand> {
  const [signed] = await signBrands(storage, [brand]);
  return signed;
}
