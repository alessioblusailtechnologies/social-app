import './env';

import { query, type Options } from '@anthropic-ai/claude-agent-sdk';
import Fastify from 'fastify';

import { config } from '../../be-node/src/config';
import { supabaseStorage } from '../../be-node/src/media/storage';
import { agentConfig } from './config';
import { guardHiggsfield, higgsfieldDenied, higgsfieldServer, mirrorMedia } from './higgsfield';
import { cliAuth, staticAuth } from './higgsfield-auth';

/**
 * La prova della catena di Higgsfield, fuori dall'app: token accettato, generazione arrivata in
 * fondo, file copiato nella libreria. Sono le tre cose che possono rompersi, e conviene vederle
 * rompere qui invece che dentro un visivo.
 *
 *   npm run higgsfield
 *   npm run higgsfield -- "Fai un video di 5 secondi: onde sulla scogliera, luce del tramonto"
 *
 * I file finiscono sotto `prova/higgsfield/` nel bucket, così non si mescolano a quelli di un
 * brand vero e si cancellano in blocco.
 */

const COMPITO =
  process.argv.slice(2).join(' ').trim() ||
  'Genera una sola immagine: una tazza di caffè su un tavolo di legno, luce del mattino. ' +
    'Aspetta che il lavoro sia finito, poi dimmi cosa hai generato e dove sta.';

/** Gli strumenti nativi qui non servono: si prova Higgsfield, non l'agente. */
const NATIVI = ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'Task', 'NotebookEdit', 'TodoWrite'];

const agent = agentConfig();
const log = Fastify({ logger: { level: 'info' } }).log;

// La stessa catena del server: il token al CLI, o quello messo a mano in `.env`.
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
  console.error('Fai `higgsfield auth login`, oppure metti un bearer a mano in AGENT_HIGGSFIELD_TOKEN.\n');
  process.exit(1);
}
const storage = supabaseStorage(config());
const saved = new Map<string, string>();

const options: Options = {
  model: agent.AGENT_MODEL,
  effort: agent.AGENT_EFFORT,
  maxBudgetUsd: agent.AGENT_MAX_BUDGET_USD,
  maxTurns: 20,
  permissionMode: 'bypassPermissions',
  allowDangerouslySkipPermissions: true,
  persistSession: false,
  mcpServers: { higgsfield: higgsfieldServer({ url: agent.AGENT_HIGGSFIELD_URL, token }) },
  disallowedTools: [...higgsfieldDenied, ...NATIVI],
  hooks: {
    PreToolUse: [{ hooks: [guardHiggsfield(log)] }],
    PostToolUse: [{ hooks: [mirrorMedia({ accountId: 'prova', brandId: 'higgsfield', storage, log, saved })] }],
  },
};

console.log(`\n${COMPITO}\n`);

for await (const message of query({ prompt: COMPITO, options })) {
  // Il primo messaggio dice se il server remoto ha accettato il token: `needs-auth` vuol dire di no,
  // e la sessione andrebbe avanti come se Higgsfield non esistesse.
  if (message.type === 'system' && message.subtype === 'init') {
    for (const server of message.mcp_servers) console.log(`· ${server.name}: ${server.status}`);
    // I nomi veri dei loro strumenti, che finora abbiamo solo dedotto: servono a stringere la lista
    // di quelli vietati, che oggi tiene per pattern.
    const strumenti = message.tools.filter((tool) => tool.startsWith('mcp__higgsfield__'));
    console.log(`· ${strumenti.length} strumenti:\n  ${strumenti.map((tool) => tool.slice('mcp__higgsfield__'.length)).join('\n  ')}\n`);
  } else if (message.type === 'assistant') {
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

console.log(saved.size > 0 ? `\nnella libreria:\n${[...saved.values()].join('\n')}` : '\nnessun file copiato nella libreria.');
process.exit(0);
