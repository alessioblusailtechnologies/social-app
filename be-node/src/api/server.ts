import '../env';

import { AgentSdkEngine, unavailableEngine } from '../ai/engine';
import { modelTarget } from '../ai/providers';
import { config } from '../config';
import { recordUsage } from '../data/usage';
import { db } from '../db/pool';
import { supabaseAuthGateway } from '../services/auth';
import { buildApp } from './app';
import { supabaseVerifier } from './plugins/auth';

const settings = config();
const pool = db();
const aiTarget = modelTarget(settings.AI_MODEL, {
  anthropic: settings.ANTHROPIC_API_KEY,
  deepseek: { key: settings.DEEPSEEK_API_KEY, baseUrl: settings.DEEPSEEK_BASE_URL },
});

const app = buildApp({
  logger: { level: settings.LOG_LEVEL },
  pool,
  verifyToken: supabaseVerifier(settings),
  auth: supabaseAuthGateway(settings),
  corsOrigins: settings.CORS_ORIGINS,
  ai: (log) =>
    aiTarget
      ? new AgentSdkEngine({
          model: settings.AI_MODEL,
          target: aiTarget,
          effort: settings.AI_EFFORT,
          timeoutMs: settings.AI_TIMEOUT_MS,
          maxBudgetUsd: settings.AI_MAX_BUDGET_USD,
          log,
          recordUsage: (usage) => recordUsage(pool, usage),
        })
      : unavailableEngine,
});

if (!aiTarget) app.log.warn({ model: settings.AI_MODEL }, 'AI spenta: manca la chiave del fornitore del modello');

try {
  // Le piattaforme assegnano la porta in PORT: vince su API_PORT.
  await app.listen({ port: Number(process.env.PORT) || settings.API_PORT, host: '0.0.0.0' });
} catch (error) {
  app.log.fatal({ err: error }, 'avvio fallito');
  process.exit(1);
}
