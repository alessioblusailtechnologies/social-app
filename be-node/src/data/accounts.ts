import type { Queryable } from '../db/pool';

/** Il profilo Presenza di un utente di Supabase Auth, come lo vede il FE. */
export interface Account {
  id: string;
  email: string;
  name: string;
}

interface AccountRow {
  id: string;
  email: string;
  name: string;
  active_brand_id: string | null;
}

export async function findAccount(db: Queryable, accountId: string): Promise<(Account & { activeBrandId: string | null }) | null> {
  const { rows } = await db.query<AccountRow>(
    'select id, email, name, active_brand_id from presenza.accounts where id = $1',
    [accountId],
  );
  const row = rows[0];
  return row ? { id: row.id, email: row.email, name: row.name, activeBrandId: row.active_brand_id } : null;
}

/** Idempotente: una registrazione ripetuta con la stessa utenza non tocca il profilo esistente. */
export async function createAccount(db: Queryable, account: Account): Promise<void> {
  await db.query('insert into presenza.accounts (id, email, name) values ($1, $2, $3) on conflict (id) do nothing', [
    account.id,
    account.email,
    account.name,
  ]);
}

export async function recordSignIn(db: Queryable, accountId: string): Promise<void> {
  await db.query('update presenza.accounts set last_sign_in_at = now() where id = $1', [accountId]);
}

export async function setActiveBrand(db: Queryable, accountId: string, brandId: string | null): Promise<void> {
  await db.query('update presenza.accounts set active_brand_id = $2 where id = $1', [accountId, brandId]);
}
