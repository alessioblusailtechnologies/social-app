import type { Queryable } from '../db/pool';

/**
 * La coda dei visivi. L'API mette in coda dentro la transazione dell'utente (la policy lascia inserire solo le
 * righe del proprio account); il runner prende e chiude i lavori col ruolo proprietario.
 */

export type VisualJobKind = 'create' | 'render';

export interface VisualJob {
  id: string;
  contentId: string;
  accountId: string;
  brandId: string;
  kind: VisualJobKind;
  attempts: number;
}

interface JobRow {
  id: string;
  content_id: string;
  account_id: string;
  brand_id: string;
  kind: VisualJobKind;
  attempts: number;
}

const toJob = (row: JobRow): VisualJob => ({
  id: row.id,
  contentId: row.content_id,
  accountId: row.account_id,
  brandId: row.brand_id,
  kind: row.kind,
  attempts: row.attempts,
});

/** Un lavoro uguale già in coda o in corso basta: il secondo non si aggiunge. */
export async function enqueueVisualJob(db: Queryable, job: Omit<VisualJob, 'id' | 'attempts'>): Promise<void> {
  await db.query(
    `insert into presenza.visual_jobs (content_id, account_id, brand_id, kind)
     values ($1, $2, $3, $4)
     on conflict (content_id, kind) where status in ('queued', 'running') do nothing`,
    [job.contentId, job.accountId, job.brandId, job.kind],
  );
}

/** Il lavoro più vecchio in coda, preso in modo che due processi non prendano lo stesso. */
export async function claimVisualJob(db: Queryable): Promise<VisualJob | null> {
  const { rows } = await db.query<JobRow>(
    `update presenza.visual_jobs
        set status = 'running', started_at = now(), attempts = attempts + 1
      where id = (
        select id from presenza.visual_jobs
         where status = 'queued'
         order by created_at
         limit 1
         for update skip locked
      )
      returning id, content_id, account_id, brand_id, kind, attempts`,
  );
  return rows[0] ? toJob(rows[0]) : null;
}

export async function finishVisualJob(db: Queryable, jobId: string, error: string | null): Promise<void> {
  await db.query(`update presenza.visual_jobs set status = $2, error = $3, finished_at = now() where id = $1`, [
    jobId,
    error === null ? 'done' : 'failed',
    error,
  ]);
}

/** Dopo un riavvio i lavori rimasti a metà tornano in coda; quelli chiusi da una settimana si cancellano. */
export async function recoverVisualJobs(db: Queryable, staleMinutes: number): Promise<number> {
  const { rowCount } = await db.query(
    `update presenza.visual_jobs
        set status = 'queued', started_at = null
      where status = 'running' and started_at < now() - make_interval(mins => $1)`,
    [staleMinutes],
  );
  await db.query(
    `delete from presenza.visual_jobs where status in ('done', 'failed') and finished_at < now() - interval '7 days'`,
  );
  return rowCount ?? 0;
}
