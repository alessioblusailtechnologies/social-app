import type { FastifyInstance } from 'fastify';

import type { Content } from '@/domain/content';

import { photoUploadSchema, visualDesignSchema, visualEditSchema } from '../../contract/schemas';
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
import { signContent } from '../../visual/files';
import { queueJob } from './jobs';
import { idFrom } from './params';

type ContentParams = { Params: { contentId: string } };

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
