import type { FastifyInstance } from 'fastify';

import { analyzeVoice, readWebsite, suggestPositioning, suggestThemes } from '../../ai/profile';
import {
  positioningRequestSchema,
  referenceUploadSchema,
  themesRequestSchema,
  visualStyleRequestSchema,
  voiceRequestSchema,
  websiteRequestSchema,
} from '../../contract/schemas';
import { aiMeta, type Deps } from '../../services/deps';
import { parsePhotoDataUri } from '../../services/visual';
import { proposeVisualStyle, uploadReference } from '../../services/visual-style';
import { sendSteps } from '../steps';

/** L'AI del profilo: lavora sull'identità che l'utente sta scrivendo, prima che il brand esista. */
export function registerAiRoutes(app: FastifyInstance, deps: Deps): void {
  app.post('/api/ai/website', (request) => {
    const { site, identity } = websiteRequestSchema.parse(request.body);
    return readWebsite(deps.ai, aiMeta(request.identity), site, identity);
  });

  /** La stessa lettura, con i passi dell'AI man mano che li fa. */
  app.post('/api/ai/website/stream', (request, reply) => {
    const { site, identity } = websiteRequestSchema.parse(request.body);
    return sendSteps(request, reply, (onSteps) => readWebsite(deps.ai, aiMeta(request.identity), site, identity, onSteps));
  });

  app.post('/api/ai/themes', (request) => {
    const { identity } = themesRequestSchema.parse(request.body);
    return suggestThemes(deps.ai, aiMeta(request.identity), identity);
  });

  app.post('/api/ai/positioning', (request) => {
    const { identity, site } = positioningRequestSchema.parse(request.body);
    return suggestPositioning(deps.ai, aiMeta(request.identity), identity, site);
  });

  app.post('/api/ai/positioning/stream', (request, reply) => {
    const { identity, site } = positioningRequestSchema.parse(request.body);
    return sendSteps(request, reply, (onSteps) =>
      suggestPositioning(deps.ai, aiMeta(request.identity), identity, site, onSteps),
    );
  });

  /** Lo stile delle card: riferimenti e indicazioni, poi un esempio per canale composto da be-render. */
  app.post('/api/ai/visual/stream', (request, reply) => {
    const body = visualStyleRequestSchema.parse(request.body);
    return sendSteps(request, reply, (onSteps) =>
      proposeVisualStyle(deps, request.identity, body, { log: request.log, onSteps }),
    );
  });

  app.post('/api/media/references', (request) => {
    const { dataUri } = referenceUploadSchema.parse(request.body);
    return uploadReference(deps, request.identity, parsePhotoDataUri(dataUri));
  });

  app.post('/api/ai/voice', (request) => {
    const { sample, identity } = voiceRequestSchema.parse(request.body);
    return analyzeVoice(deps.ai, aiMeta(request.identity), sample, identity);
  });
}
