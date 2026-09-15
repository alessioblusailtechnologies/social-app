import type { FastifyInstance } from 'fastify';

import { refreshSchema, signInSchema, signUpSchema } from '../../contract/schemas';
import { currentAccount, refreshSession, signIn, signUp, type AuthGateway } from '../../services/auth';
import type { Deps } from '../../services/deps';

export function registerAuthRoutes(app: FastifyInstance, deps: Deps, gateway: AuthGateway): void {
  app.post('/api/auth/sign-up', async (request, reply) => {
    const result = await signUp(deps.pool, gateway, signUpSchema.parse(request.body));
    return reply.code(201).send(result);
  });

  app.post('/api/auth/sign-in', (request) => signIn(deps.pool, gateway, signInSchema.parse(request.body)));

  app.post('/api/auth/refresh', (request) => refreshSession(gateway, refreshSchema.parse(request.body).refreshToken));

  app.get('/api/auth/me', (request) => currentAccount(deps.pool, request.identity));
}
