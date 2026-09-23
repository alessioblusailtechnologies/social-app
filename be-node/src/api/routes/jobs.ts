import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { ApiError } from '../../contract/errors';
import { cancelJob, enqueueJob, findJob, findOpenJob, type JobView } from '../../data/jobs';
import { JOB_KINDS } from '../../jobs/kinds';
import { inTransaction, type Deps } from '../../services/deps';
import { idFrom } from './params';

/**
 * I lavori dell'AI: si accoda e si risponde subito con l'id, poi l'app rilegge il lavoro
 * finché è in corso. Il corpo si valida qui, prima di accodare, così una richiesta sbagliata
 * resta un errore normale invece di diventare un lavoro che fallirà.
 */

type JobParams = { Params: { jobId: string } };

/** Mette in coda e risponde `202 { jobId }`. La usano le rotte delle generazioni. */
export async function queueJob(
  deps: Deps,
  request: FastifyRequest,
  reply: FastifyReply,
  job: { kind: string; input: unknown; brandId?: string | null; ref?: string | null },
): Promise<FastifyReply> {
  const kind = JOB_KINDS[job.kind];
  if (!kind) throw ApiError.notFound('Questa generazione non esiste.');
  // Vale come validazione del corpo: se lo schema non lo accetta, non si accoda niente.
  kind.prepare(job.input);

  const jobId = await inTransaction(deps, request.identity, (db) =>
    enqueueJob(db, {
      accountId: request.identity.accountId,
      brandId: job.brandId ?? null,
      kind: job.kind,
      ref: job.ref ?? null,
      input: job.input,
    }),
  );
  deps.jobs.wake();
  return reply.code(202).send({ jobId });
}

/** Si cerca per tipo (l'onboarding, che non ha ancora un oggetto), per oggetto, o per tutti e due. */
const openQuerySchema = z
  .object({ kind: z.string().min(1).max(60).optional(), ref: z.uuid().optional() })
  .refine((query) => query.kind !== undefined || query.ref !== undefined, 'Serve il tipo di lavoro o l’oggetto.');

export function registerJobRoutes(app: FastifyInstance, deps: Deps): void {
  const jobId = (value: string) => idFrom(value, 'Lavoro non trovato.');

  /**
   * Il lavoro aperto di questo tipo, se c'è. L'app lo chiede riaprendo una schermata: se una
   * generazione è ancora in corso si rimette a guardarla invece di ricominciare.
   */
  app.get<{ Querystring: { kind?: string; ref?: string } }>('/api/jobs/open', async (request) => {
    const { kind, ref } = openQuerySchema.parse(request.query);
    const job = await inTransaction(deps, request.identity, (db) => findOpenJob(db, kind ?? null, ref ?? null));
    return { job: job && (await signed(deps, job)) };
  });

  /** A che punto è: i passi fatti finora e, alla fine, il risultato o l'errore. */
  app.get<JobParams>('/api/jobs/:jobId', async (request) => {
    const job = await inTransaction(deps, request.identity, (db) => findJob(db, jobId(request.params.jobId)));
    if (!job) throw ApiError.notFound('Lavoro non trovato.');
    return signed(deps, job);
  });

  /** Non interessa più: il runner smette di aggiornarlo al passo dopo. */
  app.post<JobParams>('/api/jobs/:jobId/cancel', async (request, reply) => {
    await inTransaction(deps, request.identity, (db) => cancelJob(db, jobId(request.params.jobId)));
    return reply.code(204).send();
  });
}

/** Gli indirizzi dei file si firmano adesso: nel risultato salvato scadrebbero. */
async function signed(deps: Deps, job: JobView): Promise<JobView> {
  const sign = JOB_KINDS[job.kind]?.sign;
  if (!sign || job.status !== 'done' || job.result === null) return job;
  return { ...job, result: await sign(deps, job.result) };
}
