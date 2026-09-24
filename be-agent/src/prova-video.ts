import './env';

import { mkdir } from 'node:fs/promises';
import { delimiter, join } from 'node:path';

import { query, type Options } from '@anthropic-ai/claude-agent-sdk';
import Fastify from 'fastify';

import { config } from '../../be-node/src/config';
import { supabaseStorage } from '../../be-node/src/media/storage';
import { agentConfig, workspacesRoot } from './config';
import { guardHiggsfield, higgsfieldDenied, higgsfieldServer, mirrorMedia } from './higgsfield';
import { cliAuth, staticAuth } from './higgsfield-auth';
import { deliverBeforeLeaving, ffmpegDir, prepareStudio, videoTools } from './video';

/**
 * Un video intero, fuori dall'app: la storia, le clip girate da Higgsfield, il montaggio scritto in
 * Remotion e reso nella cartella di lavoro. È lo stesso studio che avrà l'agente quando il compito
 * arriverà da un contenuto — qui senza brand vero, così si prova senza toccare i dati di nessuno.
 *
 *   npm run video
 *   npm run video -- "Un reel da 15 secondi per una gelateria artigianale di quartiere"
 */

const COMPITO =
  process.argv.slice(2).join(' ').trim() ||
  'Fai un video verticale di circa 10 secondi, due scene, per una caffetteria di quartiere che apre presto. ' +
    'Scrivi tu la storia e le due frasi che si leggono a schermo, gira le clip, montale e consegna il risultato.';

const agent = agentConfig();
const log = Fastify({ logger: { level: 'info' } }).log;

const auth = agent.AGENT_HIGGSFIELD_TOKEN
  ? staticAuth(agent.AGENT_HIGGSFIELD_TOKEN)
  : cliAuth({
      command: agent.AGENT_HIGGSFIELD_CLI,
      args: agent.AGENT_HIGGSFIELD_CLI_ARGS.split(' ').filter(Boolean),
      log,
    });

let token: string;
try {
  token = await auth.token();
} catch (error) {
  console.error(`\nNessuna sessione di Higgsfield: ${error instanceof Error ? error.message : String(error)}`);
  console.error('Fai `higgsfield auth login`.\n');
  process.exit(1);
}

const dir = join(workspacesRoot(), '_prova-video');
await mkdir(dir, { recursive: true });
const studio = await prepareStudio(dir);

// ffmpeg dove l'agente lo cerca: nel PATH.
const ffmpeg = ffmpegDir();
if (ffmpeg) process.env.PATH = `${ffmpeg}${delimiter}${process.env.PATH ?? ''}`;
else console.error('Attenzione: ffmpeg non trovato, il montaggio potrebbe non riuscire.\n');

const storage = supabaseStorage(config());
const saved = new Map<string, string>();
const delivered = new Map<string, string>();

const options: Options = {
  cwd: dir,
  model: agent.AGENT_MODEL,
  effort: agent.AGENT_EFFORT,
  maxBudgetUsd: agent.AGENT_MAX_BUDGET_USD,
  maxTurns: agent.AGENT_MAX_TURNS,
  systemPrompt: { type: 'preset', preset: 'claude_code' },
  permissionMode: 'bypassPermissions',
  allowDangerouslySkipPermissions: true,
  persistSession: false,
  mcpServers: {
    higgsfield: higgsfieldServer({ url: agent.AGENT_HIGGSFIELD_URL, token }),
    montaggio: videoTools({ accountId: 'prova', brandId: 'video', dir, storage, log, delivered }),
  },
  disallowedTools: higgsfieldDenied,
  hooks: {
    PreToolUse: [{ hooks: [guardHiggsfield(log)] }],
    PostToolUse: [{ hooks: [mirrorMedia({ accountId: 'prova', brandId: 'video', storage, log, saved, dir })] }],
    Stop: [{ hooks: [deliverBeforeLeaving({ delivered, log })] }],
  },
};

const prompt = `Sei nella cartella di lavoro. Contiene:\n- ${studio}\n\n---\n\n${COMPITO}`;
console.log(`\n${COMPITO}\n`);

for await (const message of query({ prompt, options })) {
  if (message.type === 'assistant') {
    for (const block of message.message.content) {
      if (block.type === 'tool_use') console.log(`→ ${block.name}`);
      else if (block.type === 'text' && block.text.trim()) console.log(block.text.trim());
    }
  } else if (message.type === 'result') {
    console.log(
      `\n${message.subtype === 'success' ? 'fatto' : message.subtype} · ${message.num_turns} giri · $${message.total_cost_usd.toFixed(2)}`,
    );
  }
}

console.log(`\ncartella di lavoro: ${dir}`);
console.log(
  delivered.size > 0
    ? `consegnato:\n${[...delivered].map(([path, cosa]) => `  ${cosa}: ${path}`).join('\n')}`
    : 'niente consegnato nella libreria.',
);
process.exit(0);
