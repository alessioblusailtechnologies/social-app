import { PassThrough } from 'node:stream';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { AiStreamEvent, OnAiSteps } from '@/services/types';

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
import { describeError } from '../plugins/errors';

/** Mentre una pagina si fa aspettare, un commento ogni tanto tiene aperta la connessione. */
const HEARTBEAT_MS = 15_000;

/**
 * Una risposta a passi in Server-Sent Events: un evento `data:` per ogni cambio dei passi, poi il risultato
 * o l'errore. SSE e non righe di JSON perché i proxy davanti al server non trattengono gli eventi.
 * Gli errori di validazione arrivano prima, come una risposta normale.
 */
function sendSteps<T>(request: FastifyRequest, reply: FastifyReply, work: (onSteps: OnAiSteps) => Promise<T>): FastifyReply {
  const stream = new PassThrough();
  const write = (chunk: string) => {
    if (!stream.destroyed && !stream.writableEnded) stream.write(chunk);
  };
  const send = (event: AiStreamEvent<T>) => write(`data: ${JSON.stringify(event)}\n\n`);
  const heartbeat = setInterval(() => write(': ancora al lavoro\n\n'), HEARTBEAT_MS);

  work((steps) => send({ type: 'steps', steps }))
    .then((result) => send({ type: 'result', result }))
    .catch((error: unknown) => {
      send({ type: 'error', ...describeError(error, request.log) });
    })
    .finally(() => {
      clearInterval(heartbeat);
      if (!stream.destroyed) stream.end();
    });

  return reply
    .header('content-type', 'text/event-stream; charset=utf-8')
    .header('cache-control', 'no-cache, no-transform')
    .header('x-accel-buffering', 'no')
    .send(stream);
}

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
