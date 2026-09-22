import { PassThrough } from 'node:stream';

import type { FastifyReply, FastifyRequest } from 'fastify';

import type { AiStreamEvent, OnAiSteps } from '@/services/types';

import { describeError } from './plugins/errors';

/** Mentre una pagina si fa aspettare, un commento ogni tanto tiene aperta la connessione. */
const HEARTBEAT_MS = 15_000;

/**
 * Una risposta a passi in Server-Sent Events: un evento `data:` per ogni cambio dei passi, poi il risultato
 * o l'errore. SSE e non righe di JSON perché i proxy davanti al server non trattengono gli eventi.
 * Gli errori di validazione arrivano prima, come una risposta normale.
 */
export function sendSteps<T>(request: FastifyRequest, reply: FastifyReply, work: (onSteps: OnAiSteps) => Promise<T>): FastifyReply {
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
