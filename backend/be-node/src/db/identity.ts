import type pg from 'pg';

/** Chi fa la richiesta, dal JWT di Supabase Auth. */
export interface Identity {
  accountId: string;
}

/**
 * Esegue `fn` in una transazione **con l'identità dell'account**: il ruolo diventa
 * `presenza_user` e i claim del JWT vanno dove li legge `presenza.current_account_id()`.
 * Da lì ogni query passa dalle policy RLS: un errore nel codice diventa "nessuna riga",
 * mai "le righe di un altro account". `set local` muore con la transazione, quindi la
 * connessione torna pulita al pool.
 *
 * Il codice di sistema (registrazione, consumi dell'AI) usa invece il pool, col ruolo
 * proprietario delle tabelle.
 */
export async function withIdentity<T>(
  pool: pg.Pool,
  identity: Identity,
  fn: (client: pg.ClientBase) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const claims = JSON.stringify({ sub: identity.accountId, role: 'presenza_user' });
    await client.query("select set_config('request.jwt.claims', $1, true)", [claims]);
    await client.query('set local role presenza_user');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
