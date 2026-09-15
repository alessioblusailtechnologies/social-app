import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type pg from 'pg';

import type { Config } from '../config';
import { ApiError } from '../contract/errors';
import { createAccount, findAccount, recordSignIn, type Account } from '../data/accounts';
import { withIdentity, type Identity } from '../db/identity';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  /** Secondi. */
  expiresIn: number;
}

export interface AuthResult extends Tokens {
  account: Account;
}

/** Supabase Auth dietro un'interfaccia: la registrazione e i token passano tutti da qui. */
export interface AuthGateway {
  /** Crea l'utenza con l'email già confermata; `null` se l'email è già registrata nel progetto. */
  createUser(email: string, password: string): Promise<{ id: string } | null>;
  /** `null` se email e password non corrispondono. */
  signIn(email: string, password: string): Promise<(Tokens & { userId: string }) | null>;
  refresh(refreshToken: string): Promise<Tokens | null>;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: { id: string };
}

export function supabaseAuthGateway(
  config: Pick<Config, 'SUPABASE_URL' | 'SUPABASE_ANON_KEY' | 'SUPABASE_SERVICE_ROLE_KEY'>,
): AuthGateway {
  let admin: SupabaseClient | undefined;

  const requestToken = async (grant: 'password' | 'refresh_token', body: Record<string, string>) => {
    const response = await fetch(new URL(`/auth/v1/token?grant_type=${grant}`, config.SUPABASE_URL), {
      method: 'POST',
      headers: { apikey: config.SUPABASE_ANON_KEY, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (response.status === 429) {
      throw new ApiError(429, 'TOO_MANY_REQUESTS', 'Troppi tentativi: riprova tra qualche minuto.');
    }
    if (response.status >= 500) throw new Error(`Supabase Auth risponde ${response.status}`);
    if (!response.ok) return null;
    const data = (await response.json()) as TokenResponse;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      userId: data.user.id,
    };
  };

  return {
    async createUser(email, password) {
      admin ??= createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      // Email confermata subito: il progetto non ha un SMTP suo e il limite di quello di Supabase è di poche email l'ora.
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (!error) return { id: data.user.id };
      if (error.code === 'email_exists' || error.code === 'user_already_exists') return null;
      if (error.code === 'weak_password') throw ApiError.invalid('La password è troppo debole: allungala o aggiungi numeri e simboli.');
      throw error;
    },
    signIn: (email, password) => requestToken('password', { email, password }),
    async refresh(refreshToken) {
      const result = await requestToken('refresh_token', { refresh_token: refreshToken });
      return result && { accessToken: result.accessToken, refreshToken: result.refreshToken, expiresIn: result.expiresIn };
    },
  };
}

function toAccount(account: Account): Account {
  return { id: account.id, email: account.email, name: account.name };
}

/**
 * Registrazione. Il progetto Supabase è condiviso con Velia: se l'email c'è già, la
 * password decide. Se corrisponde, l'utenza è di chi si sta registrando e riceve il suo
 * profilo Presenza; se no, l'email è di qualcun altro (o la password è dimenticata).
 */
export async function signUp(
  pool: pg.Pool,
  gateway: AuthGateway,
  input: { email: string; password: string; name?: string | undefined },
): Promise<AuthResult> {
  const email = input.email.trim().toLowerCase();
  const created = await gateway.createUser(email, input.password);
  const session = await gateway.signIn(email, input.password);
  if (!session) {
    if (created) throw new Error('accesso non riuscito subito dopo la registrazione');
    throw ApiError.conflict('EMAIL_TAKEN', 'Questa email è già registrata: accedi con la sua password.');
  }
  await createAccount(pool, { id: session.userId, email, name: input.name?.trim() ?? '' });
  await recordSignIn(pool, session.userId);
  const account = await findAccount(pool, session.userId);
  if (!account) throw new Error('profilo non creato');
  const { userId: _userId, ...tokens } = session;
  return { ...tokens, account: toAccount(account) };
}

export async function signIn(pool: pg.Pool, gateway: AuthGateway, input: { email: string; password: string }): Promise<AuthResult> {
  const session = await gateway.signIn(input.email.trim().toLowerCase(), input.password);
  if (!session) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email o password non corretti.');
  const account = await findAccount(pool, session.userId);
  if (!account) throw ApiError.forbidden('NO_ACCOUNT', 'Questa email non ha ancora un account: registrati.');
  await recordSignIn(pool, session.userId);
  const { userId: _userId, ...tokens } = session;
  return { ...tokens, account: toAccount(account) };
}

/** Il refresh token di Supabase ruota a ogni uso: il FE tiene sempre l'ultimo. */
export async function refreshSession(gateway: AuthGateway, refreshToken: string): Promise<Tokens> {
  const tokens = await gateway.refresh(refreshToken);
  if (!tokens) throw ApiError.unauthenticated('Sessione scaduta: accedi di nuovo.');
  return tokens;
}

export async function currentAccount(pool: pg.Pool, identity: Identity): Promise<Account> {
  const account = await withIdentity(pool, identity, (db) => findAccount(db, identity.accountId));
  if (!account) throw ApiError.forbidden('NO_ACCOUNT', 'Questa email non ha ancora un account: registrati.');
  return toAccount(account);
}
