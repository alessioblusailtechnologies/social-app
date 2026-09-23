import type pg from 'pg';

import type { AiEngine, AiMeta } from '../ai/engine';
import { withIdentity, type Identity } from '../db/identity';
import type { Jobs } from '../jobs/runner';
import type { MediaDeps } from '../media';
import type { VisualJobs } from '../visual/runner';

/** Quello che i servizi usano: database, AI, file dei visivi e orologio, iniettati così i test li sostituiscono. */
export interface Deps {
  pool: pg.Pool;
  ai: AiEngine;
  now: () => Date;
  media: MediaDeps;
  /** La coda dei visivi, da svegliare dopo aver messo in coda un lavoro. */
  visualJobs: VisualJobs;
  /** La coda delle generazioni, svegliata dalle rotte che accodano. */
  jobs: Jobs;
}

/**
 * Le letture e le scritture dei servizi passano tutte da una transazione con l'identità di
 * chi chiama. Le generazioni AI stanno fuori: nessuna transazione resta aperta per minuti.
 */
export function inTransaction<T>(deps: Deps, identity: Identity, fn: (db: pg.ClientBase) => Promise<T>): Promise<T> {
  return withIdentity(deps.pool, identity, fn);
}

export function aiMeta(identity: Identity, brandId: string | null = null): AiMeta {
  return { accountId: identity.accountId, brandId };
}
