import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { ApiError } from '../../contract/errors';

type AnyError = Error & { code?: unknown; statusCode?: number; validation?: unknown };

/** Gli errori di Postgres che dicono qualcosa al client; gli altri restano un 500. */
const DATABASE_ERRORS: Record<string, () => ApiError> = {
  '22P02': () => ApiError.invalid(),
  '23503': () => ApiError.invalid('Un riferimento non esiste più.'),
  '23505': () => ApiError.conflict('CONFLICT', 'Esiste già.'),
  '23514': () => ApiError.invalid(),
};

function toApiError(error: AnyError): ApiError | undefined {
  if (error instanceof ApiError) return error;
  if (error instanceof ZodError) {
    // Il messaggio scritto nello schema (es. la password corta) vale più di quello generico.
    const custom = error.issues.find((issue) => issue.message && !issue.message.startsWith('Invalid'));
    return ApiError.invalid(custom?.message);
  }
  if (error.validation) return ApiError.invalid();
  if (typeof error.code === 'string' && DATABASE_ERRORS[error.code]) return DATABASE_ERRORS[error.code]();
  if (error.statusCode === 413) return new ApiError(413, 'TOO_LARGE', 'Il contenuto inviato è troppo grande.');
  if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) return ApiError.invalid();
  return undefined;
}

/** L'unico punto in cui un'eccezione diventa una risposta: lo stack va nel log, mai al client. */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler<AnyError>((error, request, reply) => {
    const known = toApiError(error);
    if (known) {
      if (known.status >= 500) request.log.warn({ code: known.code }, known.message);
      void reply.status(known.status).send(known.body());
      return;
    }
    request.log.error({ err: error }, 'errore non gestito');
    void reply.status(500).send({ code: 'INTERNAL_ERROR', message: 'Il servizio non è momentaneamente disponibile.' });
  });

  app.setNotFoundHandler((_request, reply) => {
    void reply.status(404).send(ApiError.notFound().body());
  });
}
