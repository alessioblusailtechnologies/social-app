import '../env';

import { AgentSdkEngine, unavailableEngine } from '../ai/engine';
import { config } from '../config';
import { recordUsage } from '../data/usage';
import { db } from '../db/pool';
import { supabaseAuthGateway } from '../services/auth';
import { buildApp } from './app';
import { supabaseVerifier } from './plugins/auth';

const settings = config();
const pool = db();

const app = buildApp({
  logger: { level: settings.LOG_LEVEL },
  pool,
  verifyToken: supabaseVerifier(settings),
  auth: supabaseAuthGateway(settings),
  corsOrigins: settings.CORS_ORIGINS,
  ai: (log) =>
    settings.ANTHROPIC_API_KEY
      ? new AgentSdkEngine({
          model: settings.AI_MODEL,
          effort: settings.AI_EFFORT,
          timeoutMs: settings.AI_TIMEOUT_MS,
          maxBudgetUsd: settings.AI_MAX_BUDGET_USD,
          log,
          recordUsage: (usage) => recordUsage(pool, usage),
        })
      : unavailableEngine,
});

try {
  // Le piattaforme assegnano la porta in PORT: vince su API_PORT.
  await app.listen({ port: Number(process.env.PORT) || settings.API_PORT, host: '0.0.0.0' });
} catch (error) {
  app.log.fatal({ err: error }, 'avvio fallito');
  process.exit(1);
}
