import './env';

import type { FastifyBaseLogger } from 'fastify';

import { anthropicDirector } from '../../be-node/src/ai/art-director';
import type { AiUsage } from '../../be-node/src/ai/engine';
import { buildApp } from '../../be-node/src/api/app';
import { supabaseVerifier } from '../../be-node/src/api/plugins/auth';
import { config } from '../../be-node/src/config';
import { recordUsage } from '../../be-node/src/data/usage';
import { db } from '../../be-node/src/db/pool';
import { falCutout, unavailableCutout } from '../../be-node/src/media/cutout';
import { elevenLabsMusic, unavailableMusic } from '../../be-node/src/media/music';
import { geminiImages, unavailableImages } from '../../be-node/src/media/images';
import { httpRenderer } from '../../be-node/src/media/renderer';
import { supabaseStorage } from '../../be-node/src/media/storage';
import { geminiVision, unavailableVision } from '../../be-node/src/media/vision';
import { supabaseAuthGateway } from '../../be-node/src/services/auth';
import { agentConfig, workspacesRoot } from './config';
import { AgentEngine } from './engine';
import { cliAuth, staticAuth, type HiggsfieldAuth } from './higgsfield-auth';

/**
 * Il secondo backend. Espone le stesse rotte di be-node, sullo stesso database e sullo stesso
 * storage: quello che cambia è chi genera. Per provarlo basta spostare `EXPO_PUBLIC_API_URL`
 * dell'app dalla 3010 alla 3011, e per tornare indietro rimetterla com'era.
 */

const settings = config();
const agent = agentConfig();
const pool = db();
const storage = supabaseStorage(settings);
const storeUsage = (usage: AiUsage) => recordUsage(pool, usage);
const renderer = httpRenderer({ baseUrl: settings.RENDER_URL, token: settings.RENDER_TOKEN, timeoutMs: settings.RENDER_TIMEOUT_MS });

/**
 * La sessione di Higgsfield è una sola per tutto il processo: il token lo si conia una volta e
 * vale finché vale, per tutte le generazioni. Un token messo a mano in `.env` scavalca il CLI.
 */
let higgsfieldAuth: HiggsfieldAuth | undefined;
const higgsfield = (log: FastifyBaseLogger) => {
  higgsfieldAuth ??= agent.AGENT_HIGGSFIELD_TOKEN
    ? staticAuth(agent.AGENT_HIGGSFIELD_TOKEN)
    : cliAuth({
        command: agent.AGENT_HIGGSFIELD_CLI,
        args: agent.AGENT_HIGGSFIELD_CLI_ARGS.split(' ').filter(Boolean),
        log,
      });
  return { url: agent.AGENT_HIGGSFIELD_URL, auth: higgsfieldAuth, imageModel: agent.AGENT_HIGGSFIELD_IMAGE_MODEL };
};

const anthropicKey = settings.ANTHROPIC_API_KEY;
if (!anthropicKey) {
  throw new Error('Serve ANTHROPIC_API_KEY in be-node/.env: qui il modello è sempre un Claude servito da Anthropic.');
}

const app = buildApp({
  logger: { level: settings.LOG_LEVEL },
  pool,
  verifyToken: supabaseVerifier(settings),
  auth: supabaseAuthGateway(settings),
  corsOrigins: settings.CORS_ORIGINS,
  ai: (log) =>
    new AgentEngine({
      model: agent.AGENT_MODEL,
      effort: agent.AGENT_EFFORT,
      maxTurns: agent.AGENT_MAX_TURNS,
      timeoutMs: agent.AGENT_TIMEOUT_MS,
      maxBudgetUsd: agent.AGENT_MAX_BUDGET_USD,
      workspacesRoot: workspacesRoot(),
      pool,
      storage,
      images: settings.GEMINI_API_KEY
        ? geminiImages({ apiKey: settings.GEMINI_API_KEY, model: settings.IMAGE_MODEL, log, recordUsage: storeUsage })
        : unavailableImages,
      renderer,
      higgsfield: higgsfield(log),
      log,
      recordUsage: storeUsage,
    }),
  media: (log) => ({
    storage,
    images: settings.GEMINI_API_KEY
      ? geminiImages({ apiKey: settings.GEMINI_API_KEY, model: settings.IMAGE_MODEL, log, recordUsage: storeUsage })
      : unavailableImages,
    cutout: settings.FAL_KEY ? falCutout({ apiKey: settings.FAL_KEY, log, recordUsage: storeUsage }) : unavailableCutout,
    music: settings.ELEVENLABS_API_KEY
      ? elevenLabsMusic({ apiKey: settings.ELEVENLABS_API_KEY, model: settings.MUSIC_MODEL, log, recordUsage: storeUsage })
      : unavailableMusic,
    renderer,
    vision: settings.GEMINI_API_KEY
      ? geminiVision({ apiKey: settings.GEMINI_API_KEY, model: settings.VISION_MODEL, log, recordUsage: storeUsage })
      : unavailableVision,
    // Il direttore artistico di «Come appare» resta quello di be-node: guarda le immagini e scrive
    // i template del brand con una chiamata sola, non è un compito da agente.
    director: anthropicDirector({
      apiKey: anthropicKey,
      model: settings.DESIGN_MODEL,
      effort: settings.DESIGN_EFFORT,
      timeoutMs: Math.max(agent.AGENT_TIMEOUT_MS, 600_000),
      log,
      recordUsage: storeUsage,
    }),
  }),
});

app.log.info(
  { model: agent.AGENT_MODEL, effort: agent.AGENT_EFFORT, maxTurns: agent.AGENT_MAX_TURNS, workspaces: workspacesRoot() },
  'motore agentico: Claude Code con i suoi strumenti nativi',
);
// Si prova subito ad aprire la sessione: meglio saperlo all'avvio che dentro la prima generazione.
try {
  await higgsfield(app.log).auth.token();
  app.log.info({ url: agent.AGENT_HIGGSFIELD_URL }, 'higgsfield acceso: video, voci e studi passano dal suo MCP');
} catch (error) {
  app.log.warn({ err: error }, 'higgsfield spento: sessione assente o scaduta, rifai `higgsfield auth login`');
}
if (!settings.GEMINI_API_KEY) app.log.warn('foto dei visivi spente: manca GEMINI_API_KEY');
if (!settings.FAL_KEY) app.log.warn('scontorno dei visivi spento: manca FAL_KEY');

try {
  await app.listen({ port: Number(process.env.PORT) || agent.AGENT_PORT, host: '0.0.0.0' });
  await app.visualRunner.start();
  // Le generazioni le esegue questo processo: è l'unico backend acceso.
  await app.jobRunner.start();
  if (!(await renderer.health())) {
    app.log.warn({ url: settings.RENDER_URL }, 'be-render non risponde: le card non si compongono finché non parte');
  }
} catch (error) {
  app.log.fatal({ err: error }, 'avvio fallito');
  process.exit(1);
}
