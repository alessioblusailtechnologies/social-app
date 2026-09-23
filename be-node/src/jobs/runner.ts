import type { FastifyBaseLogger } from 'fastify';
import type pg from 'pg';

import type { AiStep } from '@/services/types';

import { describeError } from '../api/plugins/errors';
import { claimJob, finishJob, recoverJobs, saveJobSteps, type Job } from '../data/jobs';
import type { Identity } from '../db/identity';
import type { Deps } from '../services/deps';
import { JOB_KINDS, type JobContext } from './kinds';

/**
 * La coda delle generazioni, nel processo dell'API. Una rotta accoda e risponde subito con
 * l'id; qui il lavoro va avanti per conto suo, scrivendo i passi sulla riga man mano. Chi
 * aspetta li rilegge quando vuole: standby del telefono, cambio pagina o app chiusa non
 * fermano più niente.
 *
 * Le letture e le scritture passano dall'identità dell'account del lavoro, quindi dalla RLS;
 * la coda la tocca il ruolo proprietario.
 */

export interface Jobs {
  /** Dopo aver messo in coda: il lavoro parte subito invece che al prossimo giro. */
  wake(): void;
}

export interface JobRunner extends Jobs {
  /** Rimette in coda i lavori rimasti a metà e comincia a eseguire. Lo chiama `server.ts`. */
  start(): Promise<void>;
  stop(): void;
  /** Esegue in fila tutti i lavori in coda e dice quanti: nei test, al posto di `start`. */
  runPending(): Promise<number>;
}

export interface JobRunnerOptions {
  pool: pg.Pool;
  /** Preso al volo: le dipendenze si costruiscono insieme alla coda, e si tengono a vicenda. */
  deps: () => Deps;
  log: FastifyBaseLogger;
  /** Lavori insieme: ognuno tiene aperta una generazione lunga. */
  concurrency?: number;
  pollMs?: number;
}

/** Quanto spesso i passi finiscono nel database: l'AI ne cambia molti di fila, all'app basta l'ultimo. */
const STEPS_MS = 1000;
/** Oltre questo tempo senza notizie il lavoro è di un processo morto: torna in coda. */
const STALE_MINUTES = 15;
/** Una generazione costa: si riprova una volta sola dopo un riavvio, poi si lascia perdere. */
const MAX_ATTEMPTS = 2;

export function createJobRunner({ pool, deps, log, concurrency = 2, pollMs = 5000 }: JobRunnerOptions): JobRunner {
  let started = false;
  let pumping = false;
  let active = 0;
  let timer: NodeJS.Timeout | undefined;

  /**
   * I passi sulla riga, non più spesso di `STEPS_MS`: l'ultimo stato arriva sempre, anche
   * quando il lavoro finisce subito dopo. Se la riga non si aggiorna più il lavoro è stato
   * annullato: si smette di scrivere (il motore però va avanti fino in fondo, non si spegne).
   */
  function stepWriter(jobId: string) {
    let waiting: AiStep[] | null = null;
    let writing: Promise<void> = Promise.resolve();
    let last = 0;
    let timeout: NodeJS.Timeout | undefined;
    let live = true;

    const flush = () => {
      timeout = undefined;
      const steps = waiting;
      if (!steps || !live) return;
      waiting = null;
      last = Date.now();
      writing = writing
        .then(async () => {
          live = await saveJobSteps(pool, jobId, steps);
        })
        .catch((error: unknown) => {
          log.warn({ err: error, jobId }, 'passi del lavoro non salvati');
        });
    };

    return {
      onSteps(steps: AiStep[]) {
        if (!live) return;
        waiting = steps;
        if (timeout) return;
        const wait = Math.max(0, last + STEPS_MS - Date.now());
        timeout = setTimeout(flush, wait);
        timeout.unref();
      },
      /** Prima di chiudere: l'ultimo stato dei passi non si perde. */
      async settle(): Promise<void> {
        if (timeout) clearTimeout(timeout);
        flush();
        await writing;
      },
    };
  }

  async function runJob(job: Job): Promise<void> {
    const identity: Identity = { accountId: job.accountId };
    const steps = stepWriter(job.id);
    try {
      const kind = JOB_KINDS[job.kind];
      if (!kind) throw new Error(`tipo di lavoro sconosciuto: ${job.kind}`);
      if (job.attempts > MAX_ATTEMPTS) throw new Error(`fermato dopo ${MAX_ATTEMPTS} tentativi`);

      const context: JobContext = { deps: deps(), identity, log, onSteps: steps.onSteps };
      const result = await kind.prepare(job.input)(context);
      await steps.settle();
      await finishJob(pool, job.id, { result });
    } catch (error) {
      log.error({ err: error, jobId: job.id, kind: job.kind }, 'generazione non riuscita');
      await steps.settle().catch(() => undefined);
      const { status, code, message } = describeError(error, log);
      await finishJob(pool, job.id, { error: { status, code, message } }).catch((failure: unknown) =>
        log.error({ err: failure, jobId: job.id }, 'lavoro non chiuso'),
      );
    }
  }

  async function pump(): Promise<void> {
    if (!started || pumping) return;
    pumping = true;
    try {
      while (started && active < concurrency) {
        const job = await claimJob(pool);
        if (!job) break;
        active += 1;
        void runJob(job).finally(() => {
          active -= 1;
          void pump();
        });
      }
    } catch (error) {
      log.error({ err: error }, 'coda delle generazioni non letta');
    } finally {
      pumping = false;
    }
  }

  return {
    wake() {
      void pump();
    },

    async start() {
      if (started) return;
      started = true;
      try {
        const recovered = await recoverJobs(pool, STALE_MINUTES);
        if (recovered > 0) log.warn({ recovered }, 'generazioni rimesse in coda dopo un riavvio');
      } catch (error) {
        log.error({ err: error }, 'coda delle generazioni non ripristinata');
      }
      timer = setInterval(() => void pump(), pollMs);
      timer.unref();
      void pump();
    },

    stop() {
      started = false;
      if (timer) clearInterval(timer);
    },

    async runPending() {
      let count = 0;
      for (let job = await claimJob(pool); job; job = await claimJob(pool)) {
        await runJob(job);
        count += 1;
      }
      return count;
    },
  };
}
