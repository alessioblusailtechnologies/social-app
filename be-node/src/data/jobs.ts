import type { AiStep } from '@/services/types';

import type { Queryable } from '../db/pool';

/**
 * La coda dei lavori dell'AI. L'API accoda dentro la transazione dell'utente (la policy lascia
 * inserire e leggere solo le righe del proprio account); il runner prende, scrive i passi e
 * chiude i lavori col ruolo proprietario.
 */

export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'canceled';

export interface JobFailure {
  status: number;
  code: string;
  message: string;
}

/** Quello che serve al runner per eseguire. */
export interface Job {
  id: string;
  accountId: string;
  brandId: string | null;
  kind: string;
  input: unknown;
  attempts: number;
}

/** Quello che l'app vede quando chiede a che punto è. */
export interface JobView {
  id: string;
  kind: string;
  status: JobStatus;
  steps: AiStep[];
  result: unknown;
  error: JobFailure | null;
}

interface JobRow {
  id: string;
  account_id: string;
  brand_id: string | null;
  kind: string;
  input: unknown;
  attempts: number;
}

interface ViewRow {
  id: string;
  kind: string;
  status: JobStatus;
  steps: AiStep[];
  result: unknown;
  error: JobFailure | null;
}

const toJob = (row: JobRow): Job => ({
  id: row.id,
  accountId: row.account_id,
  brandId: row.brand_id,
  kind: row.kind,
  input: row.input,
  attempts: row.attempts,
});

export async function enqueueJob(
  db: Queryable,
  job: { accountId: string; brandId: string | null; kind: string; ref: string | null; input: unknown },
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into presenza.jobs (account_id, brand_id, kind, ref, input)
     values ($1, $2, $3, $4, $5)
     returning id`,
    [job.accountId, job.brandId, job.kind, job.ref, JSON.stringify(job.input)],
  );
  return rows[0].id;
}

/** A che punto è: lo legge l'app con la propria identità, quindi solo sui propri lavori. */
export async function findJob(db: Queryable, jobId: string): Promise<JobView | null> {
  const { rows } = await db.query<ViewRow>(
    `select id, kind, status, steps, result, error from presenza.jobs where id = $1`,
    [jobId],
  );
  return rows[0] ?? null;
}

/**
 * Il lavoro aperto di questo tipo, se c'è: è quello che l'app chiede riaprendo una schermata,
 * per rimettersi a guardare invece di ricominciare da capo. Con `ref` si cerca il lavoro su un
 * oggetto preciso (un contenuto, un'uscita, un brand), senza si guarda solo il tipo.
 */
export async function findOpenJob(db: Queryable, kind: string | null, ref: string | null): Promise<JobView | null> {
  const { rows } = await db.query<ViewRow>(
    `select id, kind, status, steps, result, error
       from presenza.jobs
      where status in ('queued', 'running')
        and ($1::text is null or kind = $1)
        and ($2::uuid is null or ref = $2)
      order by created_at desc
      limit 1`,
    [kind, ref],
  );
  return rows[0] ?? null;
}

/** Fermare un lavoro che non interessa più: il runner se ne accorge al passo dopo. */
export async function cancelJob(db: Queryable, jobId: string): Promise<boolean> {
  const { rowCount } = await db.query(
    `update presenza.jobs set status = 'canceled' where id = $1 and status in ('queued', 'running')`,
    [jobId],
  );
  return (rowCount ?? 0) > 0;
}

/** Il lavoro più vecchio in coda, preso in modo che due processi non prendano lo stesso. */
export async function claimJob(db: Queryable): Promise<Job | null> {
  const { rows } = await db.query<JobRow>(
    `update presenza.jobs
        set status = 'running', started_at = now(), attempts = attempts + 1
      where id = (
        select id from presenza.jobs
         where status = 'queued'
         order by created_at
         limit 1
         for update skip locked
      )
      returning id, account_id, brand_id, kind, input, attempts`,
  );
  return rows[0] ? toJob(rows[0]) : null;
}

/**
 * Scrive i passi fatti finora e dice se il lavoro interessa ancora: un lavoro annullato non
 * viene più aggiornato, e il runner lo lascia perdere.
 */
export async function saveJobSteps(db: Queryable, jobId: string, steps: AiStep[]): Promise<boolean> {
  const { rowCount } = await db.query(`update presenza.jobs set steps = $2 where id = $1 and status = 'running'`, [
    jobId,
    JSON.stringify(steps),
  ]);
  return (rowCount ?? 0) > 0;
}

/** Chiude il lavoro col risultato o con l'errore; uno annullato nel frattempo resta annullato. */
export async function finishJob(
  db: Queryable,
  jobId: string,
  outcome: { result: unknown } | { error: JobFailure },
): Promise<void> {
  const failed = 'error' in outcome;
  await db.query(
    `update presenza.jobs
        set status = $2, result = $3, error = $4, finished_at = now()
      where id = $1 and status = 'running'`,
    [
      jobId,
      failed ? 'failed' : 'done',
      failed ? null : JSON.stringify(outcome.result ?? null),
      failed ? JSON.stringify(outcome.error) : null,
    ],
  );
}

/**
 * Dopo un riavvio i lavori rimasti a metà tornano in coda: un'AI non si riprende da dov'era,
 * quindi si rifanno da capo. Quelli chiusi da un giorno si cancellano, risultato compreso.
 */
export async function recoverJobs(db: Queryable, staleMinutes: number): Promise<number> {
  const { rowCount } = await db.query(
    `update presenza.jobs
        set status = 'queued', started_at = null
      where status = 'running' and started_at < now() - make_interval(mins => $1)`,
    [staleMinutes],
  );
  await db.query(
    `delete from presenza.jobs where status in ('done', 'failed', 'canceled') and finished_at < now() - interval '1 day'`,
  );
  return rowCount ?? 0;
}
