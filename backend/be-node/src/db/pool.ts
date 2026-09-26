import pg from 'pg';

import { config } from '../config';

/*
 * Le colonne `date` restano stringhe 'YYYY-MM-DD', come nel dominio: diventando Date
 * JavaScript passerebbero dalla mezzanotte locale e scivolerebbero di un giorno.
 */
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);

let instance: pg.Pool | undefined;

/** Il pool Postgres del processo. Verso il progetto Supabase il TLS è obbligatorio. */
export function db(): pg.Pool {
  if (!instance) {
    const url = config().DATABASE_URL;
    const local = url.includes('localhost') || url.includes('127.0.0.1');
    instance = new pg.Pool({
      connectionString: url,
      ...(local ? {} : { ssl: { rejectUnauthorized: false } }),
      max: 10,
    });
  }
  return instance;
}

export async function closeDb(): Promise<void> {
  await instance?.end();
  instance = undefined;
}

/** Chi interroga senza sapere se ha il pool (sistema) o un client dentro una transazione con identità. */
export type Queryable = Pick<pg.ClientBase, 'query'>;
