import '../env';

import { anthropicDirector, unavailableDirector } from '../ai/art-director';
import { AgentSdkEngine, unavailableEngine, type AiUsage } from '../ai/engine';
import { modelTarget } from '../ai/providers';
import { config } from '../config';
import { recordUsage } from '../data/usage';
import { db } from '../db/pool';
import { falCutout, unavailableCutout } from '../media/cutout';
import { geminiImages, unavailableImages } from '../media/images';
import { httpRenderer } from '../media/renderer';
import { supabaseStorage } from '../media/storage';
import { geminiVision, unavailableVision } from '../media/vision';
import { supabaseAuthGateway } from '../services/auth';
import { buildApp } from './app';
import { supabaseVerifier } from './plugins/auth';

const settings = config();
const pool = db();
const aiTarget = modelTarget(settings.AI_MODEL, {
  anthropic: settings.ANTHROPIC_API_KEY,
  deepseek: { key: settings.DEEPSEEK_API_KEY, baseUrl: settings.DEEPSEEK_BASE_URL },
});
const storeUsage = (usage: AiUsage) => recordUsage(pool, usage);
const renderer = httpRenderer({ baseUrl: settings.RENDER_URL, token: settings.RENDER_TOKEN, timeoutMs: settings.RENDER_TIMEOUT_MS });

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
          recordUsage: storeUsage,
        })
      : unavailableEngine,
  media: (log) => ({
    storage: supabaseStorage(settings),
    images: settings.GEMINI_API_KEY
      ? geminiImages({ apiKey: settings.GEMINI_API_KEY, model: settings.IMAGE_MODEL, log, recordUsage: storeUsage })
      : unavailableImages,
    cutout: settings.FAL_KEY ? falCutout({ apiKey: settings.FAL_KEY, log, recordUsage: storeUsage }) : unavailableCutout,
    renderer,
    vision: settings.GEMINI_API_KEY
      ? geminiVision({ apiKey: settings.GEMINI_API_KEY, model: settings.VISION_MODEL, log, recordUsage: storeUsage })
      : unavailableVision,
    director: settings.ANTHROPIC_API_KEY
      ? anthropicDirector({
          apiKey: settings.ANTHROPIC_API_KEY,
          model: settings.DESIGN_MODEL,
          effort: settings.DESIGN_EFFORT,
          // Scrive HTML e CSS di più template: serve più tempo di una risposta di testo.
          timeoutMs: Math.max(settings.AI_TIMEOUT_MS, 600_000),
          log,
          recordUsage: storeUsage,
        })
      : unavailableDirector,
  }),
});

if (!aiTarget) app.log.warn({ model: settings.AI_MODEL }, 'AI spenta: manca la chiave del fornitore del modello');
if (!settings.GEMINI_API_KEY) app.log.warn('foto dei visivi spente: manca GEMINI_API_KEY');
if (!settings.FAL_KEY) app.log.warn('scontorno dei visivi spento: manca FAL_KEY');

try {
  // Le piattaforme assegnano la porta in PORT: vince su API_PORT.
  await app.listen({ port: Number(process.env.PORT) || settings.API_PORT, host: '0.0.0.0' });
  await app.visualRunner.start();
  if (!(await renderer.health())) {
    app.log.warn({ url: settings.RENDER_URL }, 'be-render non risponde: le card non si compongono finché non parte');
  }
} catch (error) {
  app.log.fatal({ err: error }, 'avvio fallito');
  process.exit(1);
}
