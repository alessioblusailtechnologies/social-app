import { createSecretKey } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { createRemoteJWKSet, jwtVerify } from 'jose';

import type { Config } from '../../config';
import { ApiError } from '../../contract/errors';
import type { Identity } from '../../db/identity';

declare module 'fastify' {
  interface FastifyRequest {
    identity: Identity;
  }
}

/** Il claim del JWT di Supabase Auth che serve: chi è l'utente. */
export type VerifyToken = (token: string) => Promise<{ sub?: string }>;

/** Il progetto Supabase è condiviso con Velia: un token valido non basta, serve un account Presenza. */
export type AccountExists = (accountId: string) => Promise<boolean>;

/** Fuori dall'autenticazione: la sonda di vita e gli ingressi. */
const PUBLIC_ROUTES = new Set(['/api/health', '/api/auth/sign-up', '/api/auth/sign-in', '/api/auth/refresh']);

/**
 * Due strade, decise dalla configurazione: col segreto legacy HS256 la verifica è locale,
 * senza si usa il JWKS del progetto (chiavi in cache dentro `jose`).
 */
export function supabaseVerifier(config: Pick<Config, 'SUPABASE_URL' | 'SUPABASE_JWT_SECRET'>): VerifyToken {
  if (config.SUPABASE_JWT_SECRET) {
    const secret = createSecretKey(Buffer.from(config.SUPABASE_JWT_SECRET));
    return async (token) => (await jwtVerify(token, secret, { audience: 'authenticated' })).payload;
  }
  const jwks = createRemoteJWKSet(new URL('/auth/v1/.well-known/jwks.json', config.SUPABASE_URL));
  return async (token) => (await jwtVerify(token, jwks, { audience: 'authenticated' })).payload;
}

/**
 * Bearer token di Supabase Auth → `request.identity`, su ogni rotta che non è pubblica.
 * Gira dopo `onRequest`, dove il plugin CORS mette le sue intestazioni: così anche un 401
 * arriva leggibile al FE web, che deve vederlo per rinnovare il token.
 */
export function registerAuth(app: FastifyInstance, verify: VerifyToken, accountExists: AccountExists): void {
  app.decorateRequest('identity');

  app.addHook('preValidation', async (request) => {
    if (request.method === 'OPTIONS') return;
    const path = request.url.split('?')[0] ?? '';
    if (PUBLIC_ROUTES.has(path)) return;

    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw ApiError.unauthenticated();

    let sub: string | undefined;
    try {
      ({ sub } = await verify(header.slice('Bearer '.length)));
    } catch {
      throw ApiError.unauthenticated('Sessione scaduta: accedi di nuovo.');
    }
    if (!sub) throw ApiError.unauthenticated();
    if (!(await accountExists(sub))) {
      throw ApiError.forbidden('NO_ACCOUNT', 'Questa email non ha ancora un account: registrati.');
    }
    request.identity = { accountId: sub };
  });
}
