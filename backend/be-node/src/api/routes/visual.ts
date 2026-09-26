import type { FastifyInstance } from 'fastify';

import type { Content } from '@shared/domain/content';

import { ApiError } from '../../contract/errors';
import {
  contentMusicSchema,
  coverTitleSchema,
  footageAttachSchema,
  footageUploadSchema,
  photoUploadSchema,
  sceneLockSchema,
  visualDesignSchema,
  visualEditSchema,
} from '../../contract/schemas';
import type { Deps } from '../../services/deps';
import {
  createVisual,
  designContentVisual,
  editVisual,
  proposeVisual,
  refreshVisual,
  regenerateVisualImage,
  uploadVisualPhoto,
} from '../../services/visual';
import { lockBrollScene } from '../../services/video-broll';
import { retitleCover, setContentMusic } from '../../services/video-cut';
import { attachFootage, footageUploadUrl } from '../../services/video-footage';
import { signContent } from '../../visual/files';
import { queueJob } from './jobs';
import { idFrom } from './params';

type ContentParams = { Params: { contentId: string } };
type SceneParams = { Params: { contentId: string; index: string } };

/** La posizione della scena nella regia, dall'indirizzo. */
function sceneIndex(value: string): number {
  const index = Number(value);
  if (!Number.isInteger(index) || index < 0 || index > 20) throw ApiError.notFound('Scena non trovata.');
  return index;
}

/** La foto caricata viaggia come data URI nel corpo: serve più spazio del solito. */
const PHOTO_BODY_LIMIT = 5 * 1024 * 1024;

/** Il visivo di un contenuto: modifiche senza AI, creazione in coda, foto dell'utente. */
export function registerVisualRoutes(app: FastifyInstance, deps: Deps): void {
  const contentId = (value: string) => idFrom(value, 'Contenuto non trovato.');
  const signed = async (pending: Promise<Content>) => signContent(deps.media.storage, await pending);

  app.put<ContentParams>('/api/contents/:contentId/visual', (request) =>
    signed(editVisual(deps, request.identity, contentId(request.params.contentId), visualEditSchema.parse(request.body))),
  );

  app.post<ContentParams>('/api/contents/:contentId/visual/propose', (request) =>
    signed(proposeVisual(deps, request.identity, contentId(request.params.contentId))),
  );

  app.post<ContentParams>('/api/contents/:contentId/visual/create', (request) =>
    signed(createVisual(deps, request.identity, contentId(request.params.contentId))),
  );

  /**
   * Il visivo disegnato da capo. Va in coda perché ci mette minuti: l'agente guarda le card
   * d'esempio, scrive il layout, lo compone e se lo guarda. Chi aspetta lo vede lavorare
   * rileggendo il lavoro, e può anche andarsene nel frattempo.
   */
  app.post<ContentParams>('/api/contents/:contentId/visual/design/job', (request, reply) => {
    const id = contentId(request.params.contentId);
    const { channels, instruction } = visualDesignSchema.parse(request.body);
    return queueJob(deps, request, reply, {
      kind: 'visual-design',
      input: { contentId: id, channels, ...(instruction ? { instruction } : {}) },
      ref: id,
    });
  });

  /** La musica del video: una traccia del brand, nessuna, o `auto`. Senza AI: poi si rimonta. */
  app.put<ContentParams>('/api/contents/:contentId/video/music', (request) =>
    signed(
      setContentMusic(deps, request.identity, contentId(request.params.contentId), contentMusicSchema.parse(request.body).musicId),
    ),
  );

  /** «Rifai la copertina»: in coda, coi passi; nasce anche da sola a ogni montaggio. */
  app.post<ContentParams>('/api/contents/:contentId/video/cover/job', (request, reply) => {
    const id = contentId(request.params.contentId);
    return queueJob(deps, request, reply, { kind: 'video-cover', input: { contentId: id }, ref: id });
  });

  /** Il titolo della copertina, cambiato a mano: si ricompone col motore, senza AI. */
  app.put<ContentParams>('/api/contents/:contentId/video/cover', (request) => {
    const { title, kicker } = coverTitleSchema.parse(request.body);
    return signed(retitleCover(deps, request.identity, contentId(request.params.contentId), title, kicker));
  });

  /** «Monta il video»: l'agente monta la regia, con un cartello dove manca il materiale. In coda come il disegno. */
  app.post<ContentParams>('/api/contents/:contentId/video/cut/job', (request, reply) => {
    const id = contentId(request.params.contentId);
    return queueJob(deps, request, reply, { kind: 'video-cut', input: { contentId: id }, ref: id });
  });

  /** Dove caricare il girato (o la foto) di una scena: l'app lo carica lì direttamente, poi conferma. */
  app.post<SceneParams>('/api/contents/:contentId/video/scenes/:index/upload', (request) =>
    footageUploadUrl(
      deps,
      request.identity,
      contentId(request.params.contentId),
      sceneIndex(request.params.index),
      footageUploadSchema.parse(request.body),
    ),
  );

  /** Il file caricato diventa il materiale della scena; `path: null` lo toglie. */
  app.put<SceneParams>('/api/contents/:contentId/video/scenes/:index/footage', (request) =>
    signed(
      attachFootage(
        deps,
        request.identity,
        contentId(request.params.contentId),
        sceneIndex(request.params.index),
        footageAttachSchema.parse(request.body).path,
      ),
    ),
  );

  /** Il b-roll di una scena: il fotogramma, poi la clip. In coda, coi passi: la clip ci mette minuti. */
  for (const step of ['frame', 'clip'] as const) {
    app.post<SceneParams>(`/api/contents/:contentId/video/scenes/:index/${step}/job`, (request, reply) => {
      const id = contentId(request.params.contentId);
      return queueJob(deps, request, reply, {
        kind: step === 'frame' ? 'video-frame' : 'video-clip',
        input: { contentId: id, index: sceneIndex(request.params.index) },
        ref: id,
      });
    });
  }

  /** Il lucchetto di una scena di b-roll: va bene così, non si rigenera più. */
  app.put<SceneParams>('/api/contents/:contentId/video/scenes/:index/lock', (request) =>
    signed(
      lockBrollScene(
        deps,
        request.identity,
        contentId(request.params.contentId),
        sceneIndex(request.params.index),
        sceneLockSchema.parse(request.body).locked,
      ),
    ),
  );

  /** «Non posso girarla»: la scena rifatta con un'altra strada. In coda, coi passi. */
  app.post<SceneParams>('/api/contents/:contentId/video/scenes/:index/replace/job', (request, reply) => {
    const id = contentId(request.params.contentId);
    return queueJob(deps, request, reply, {
      kind: 'video-scene',
      input: { contentId: id, index: sceneIndex(request.params.index) },
      ref: id,
    });
  });

  app.post<ContentParams>('/api/contents/:contentId/visual/image', (request) =>
    signed(regenerateVisualImage(deps, request.identity, contentId(request.params.contentId))),
  );

  app.post<ContentParams>('/api/contents/:contentId/visual/photo', { bodyLimit: PHOTO_BODY_LIMIT }, (request) => {
    const { dataUri } = photoUploadSchema.parse(request.body);
    return signed(uploadVisualPhoto(deps, request.identity, contentId(request.params.contentId), dataUri));
  });

  app.post<ContentParams>('/api/contents/:contentId/visual/refresh', (request) =>
    signed(refreshVisual(deps, request.identity, contentId(request.params.contentId))),
  );
}
