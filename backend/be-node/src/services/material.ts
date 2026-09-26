import { FOOTAGE_TYPES } from '@shared/domain/content';
import type { IdeaSource, MaterialFile } from '@shared/domain/idea';
import { MATERIAL_LIMIT } from '@shared/domain/idea';
import { MATERIAL_STEPS, createStepLog } from '@shared/services/ai-steps';
import type { OnAiSteps } from '@shared/services/types';

import { ApiError } from '../contract/errors';
import { requireBrand } from '../data/brands';
import { inBatches } from '../lib/batches';
import type { Identity } from '../db/identity';
import { MEDIA_EXTENSIONS, mediaPath } from '../visual/files';
import { aiMeta, inTransaction, type Deps } from './deps';

/**
 * Il materiale di chi pubblica, per la creazione «dal tuo materiale»: si carica un file alla volta direttamente nel
 * bucket (come i girati delle scene), poi Gemini lo guarda e ne fa un catalogo coi tempi. Il catalogo resta nella
 * fonte del contenuto: rifare la bozza riscrive la storia senza riguardare niente.
 */

type MaterialSource = Extract<IdeaSource, { kind: 'material' }>;

/** Quanti file si guardano insieme: un video grosso tiene aperta la chiamata a lungo. */
const LOOKING_AT_ONCE = 2;

function kindOf(mimeType: string): 'video' | 'image' | null {
  if (FOOTAGE_TYPES.video.mimeTypes.includes(mimeType)) return 'video';
  if (FOOTAGE_TYPES.image.mimeTypes.includes(mimeType)) return 'image';
  return null;
}

const TYPE_BY_EXTENSION = Object.fromEntries(Object.entries(MEDIA_EXTENSIONS).map(([type, extension]) => [extension, type]));

/** Dove caricare un file del materiale: il percorso lo decide il server, nella cartella del brand. */
export async function materialUploadUrl(
  deps: Deps,
  identity: Identity,
  brandId: string,
  file: { mimeType: string; bytes: number },
): Promise<{ path: string; uploadUrl: string }> {
  // Il brand dev'essere dell'account: il percorso sta nella sua cartella.
  await inTransaction(deps, identity, (db) => requireBrand(db, brandId));
  const kind = kindOf(file.mimeType);
  if (!kind) throw ApiError.invalid('Si caricano video MP4 o MOV e foto PNG, JPEG o WebP.');
  const { maxBytes } = FOOTAGE_TYPES[kind];
  if (file.bytes > maxBytes) throw new ApiError(413, 'TOO_LARGE', `Il file è troppo pesante: al massimo ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  const path = mediaPath(identity.accountId, brandId, file.mimeType);
  try {
    return { path, uploadUrl: await deps.media.storage.uploadUrl(path) };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, 'UPLOAD_FAILED', 'Non riesco a preparare il caricamento. Riprova.');
  }
}

/**
 * Il materiale guardato: ogni file senza catalogo si scarica e si fa guardare a Gemini, due alla volta. Un file che
 * non si riesce a guardare resta senza catalogo (la regia lo saprà); se non se ne guarda nessuno, ci si ferma.
 */
export async function catalogMaterial(
  deps: Deps,
  identity: Identity,
  brandId: string,
  source: MaterialSource,
  onSteps?: OnAiSteps,
): Promise<MaterialSource> {
  if (source.files.length === 0) throw ApiError.invalid('Scegli almeno una foto o un video.');
  if (source.files.length > MATERIAL_LIMIT) throw ApiError.invalid(`Al massimo ${MATERIAL_LIMIT} file alla volta.`);
  for (const file of source.files) {
    const extension = file.path?.split('.').pop()?.toLowerCase() ?? '';
    if (!file.path?.startsWith(`${identity.accountId}/${brandId}/`) || kindOf(TYPE_BY_EXTENSION[extension] ?? '') !== file.kind) {
      throw ApiError.invalid(`«${file.name}» non è un file caricato per questo brand.`);
    }
  }
  const missing = source.files.filter((file) => !file.catalog);
  if (missing.length === 0) return source;
  if (!deps.media.footage.available) {
    throw ApiError.unavailable('FOOTAGE_UNAVAILABLE', 'L’analisi di foto e video non è configurata su questo server.');
  }

  const log = createStepLog(onSteps);
  const meta = aiMeta(identity, brandId);
  const files = await inBatches(source.files, LOOKING_AT_ONCE, async (file, index): Promise<MaterialFile> => {
    if (file.catalog) return file;
    const step = `file-${index}`;
    log.start(step, MATERIAL_STEPS.look(file.name, file.kind), MATERIAL_STEPS.position(index, source.files.length));
    try {
      const stored = await deps.media.storage.download(file.path!);
      const extension = file.path!.split('.').pop()!.toLowerCase();
      const catalog = await deps.media.footage.catalog(
        { bytes: stored.bytes, mimeType: TYPE_BY_EXTENSION[extension] ?? stored.contentType, name: file.name, kind: file.kind },
        meta,
      );
      log.finish(step, { detail: catalog.summary.slice(0, 90) });
      return { ...file, url: '', catalog };
    } catch {
      log.finish(step, { failed: true, detail: 'Non sono riuscito a guardarlo' });
      return { ...file, url: '', catalog: null };
    }
  });
  if (files.every((file) => !file.catalog)) {
    throw new ApiError(502, 'FOOTAGE_FAILED', 'Non sono riuscito a guardare il materiale. Riprova.');
  }
  return { ...source, files };
}
