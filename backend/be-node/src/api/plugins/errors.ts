import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
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

/** Un'eccezione come `{ status, code, message }`: lo stack va nel log, mai al client. */
export function describeError(error: unknown, log: FastifyBaseLogger): { status: number; code: string; message: string } {
  const known = error instanceof Error ? toApiError(error) : undefined;
  if (known) {
    if (known.status >= 500) log.warn({ code: known.code }, known.message);
    return { status: known.status, ...known.body() };
  }
  log.error({ err: error }, 'errore non gestito');
  return { status: 500, code: 'INTERNAL_ERROR', message: 'Il servizio non è momentaneamente disponibile.' };
}

/** L'unico punto in cui un'eccezione diventa una risposta; le risposte a passi lo dicono nell'ultimo evento. */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler<AnyError>((error, request, reply) => {
    const { status, ...body } = describeError(error, request.log);
    void reply.status(status).send(body);
  });

  app.setNotFoundHandler((_request, reply) => {
    void reply.status(404).send(ApiError.notFound().body());
  });
}
