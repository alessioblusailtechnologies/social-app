import cors from '@fastify/cors';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import type pg from 'pg';

import type { AiEngine } from '../ai/engine';
import { unavailableMedia, type MediaDeps } from '../media';
import type { AuthGateway } from '../services/auth';
import type { Deps } from '../services/deps';
import { createVisualRunner, type VisualRunner } from '../visual/runner';
import { registerAuth, type AccountExists, type VerifyToken } from './plugins/auth';
import { registerErrorHandler } from './plugins/errors';
import { registerAiRoutes } from './routes/ai';
import { registerAuthRoutes } from './routes/auth';
import { registerContentRoutes } from './routes/contents';
import { registerIdeaRoutes } from './routes/ideas';
import { registerPlanRoutes } from './routes/plan';
import { registerVisualRoutes } from './routes/visual';
import { registerWorkspaceRoutes } from './routes/workspace';

declare module 'fastify' {
  interface FastifyInstance {
    /** La coda dei visivi: `server.ts` la avvia, i test eseguono i lavori con `runPending()`. */
    visualRunner: VisualRunner;
  }
}

export interface AppOptions {
  logger?: boolean | object;
  pool: pg.Pool;
  verifyToken: VerifyToken;
  auth: AuthGateway;
  /** Il motore AI, costruito col logger dell'app. */
  ai: (log: FastifyBaseLogger) => AiEngine;
  /** Storage, foto, scontorno e composizione dei visivi; senza, crearli risponde 503. */
  media?: (log: FastifyBaseLogger) => MediaDeps;
  /** Origini del FE ammesse, separate da virgola. */
  corsOrigins?: string | undefined;
  now?: () => Date;
}

/** Un account esiste finché non si cancella l'utenza: la risposta positiva resta in memoria qualche minuto. */
function accountChecker(pool: pg.Pool): AccountExists {
  const known = new Map<string, number>();
  return async (accountId) => {
    if ((known.get(accountId) ?? 0) > Date.now()) return true;
    const { rowCount } = await pool.query('select 1 from presenza.accounts where id = $1', [accountId]);
    if (!rowCount) return false;
    known.set(accountId, Date.now() + 5 * 60_000);
    return true;
  };
}

/**
 * Costruisce l'applicazione senza metterla in ascolto: i test la usano con `app.inject()`,
 * il server vero con `app.listen()`.
 */
export function buildApp(options: AppOptions): FastifyInstance {
  // Il corpo può portare il logo come data URI dal web.
  const app = Fastify({ logger: options.logger ?? true, bodyLimit: 4 * 1024 * 1024 });

  const origins = (options.corsOrigins ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (origins.length > 0) {
    void app.register(cors, { origin: origins, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] });
  }

  registerErrorHandler(app);
  registerAuth(app, options.verifyToken, accountChecker(options.pool));

  app.get('/api/health', () => ({ status: 'ok' }));

  const media = options.media?.(app.log) ?? unavailableMedia;
  // La coda si costruisce qui ma non parte: la avvia server.ts, e nei test i lavori si eseguono a mano.
  const visualRunner = createVisualRunner({ pool: options.pool, media, log: app.log });
  app.decorate('visualRunner', visualRunner);
  app.addHook('onClose', async () => {
    visualRunner.stop();
  });

  const deps: Deps = {
    pool: options.pool,
    ai: options.ai(app.log),
    now: options.now ?? (() => new Date()),
    media,
    visualJobs: visualRunner,
  };
  registerAuthRoutes(app, deps, options.auth);
  registerWorkspaceRoutes(app, deps);
  registerAiRoutes(app, deps);
  registerIdeaRoutes(app, deps);
  registerPlanRoutes(app, deps);
  registerContentRoutes(app, deps);
  registerVisualRoutes(app, deps);

  return app;
}
