import { fileURLToPath } from 'node:url';

import { z } from 'zod';

/**
 * Le manopole dell'agente, tutte facoltative: senza `.env` il server parte con questi valori.
 * Tutto il resto (Supabase, database, storage, Gemini, be-render) lo legge `config()` di be-node
 * dal suo `.env`: qui non si duplica niente.
 */

const schema = z.object({
  /** be-node sta sulla 3010: questo gli va accanto, non al suo posto. */
  AGENT_PORT: z.coerce.number().int().default(3011),
  /** Un Claude servito da Anthropic: l'agente usa i suoi strumenti nativi, non c'è un fornitore terzo. */
  AGENT_MODEL: z.string().min(1).default('claude-opus-5-5'),
  AGENT_EFFORT: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('high'),
  /**
   * Quanti giri può fare prima di consegnare. Serve largo: qui l'agente legge il profilo dalla cartella,
   * guarda i visivi, scrive, si rilegge. Il tetto vero è la spesa, non i giri.
   */
  AGENT_MAX_TURNS: z.coerce.number().int().positive().default(40),
  /** Un agente che esplora ci mette minuti, non secondi. */
  AGENT_TIMEOUT_MS: z.coerce.number().int().positive().default(900_000),
  /** Il tetto di spesa di una singola generazione: l'SDK ferma la sessione quando lo supera. */
  AGENT_MAX_BUDGET_USD: z.coerce.number().positive().default(3),
  /** Dove stanno le cartelle di lavoro, una per brand. Relativa a `be-agent/`. */
  AGENT_WORKSPACES: z.string().min(1).default('.workspaces'),
});

export type AgentConfig = z.infer<typeof schema>;

let cache: AgentConfig | undefined;

export function agentConfig(): AgentConfig {
  if (!cache) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const fields = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
      throw new Error(`Configurazione dell'agente non valida (${fields}). Vedi .env.example.`);
    }
    cache = parsed.data;
  }
  return cache;
}

/** La cartella che contiene le cartelle di lavoro, in assoluto. */
export function workspacesRoot(): string {
  return fileURLToPath(new URL(`../${agentConfig().AGENT_WORKSPACES}/`, import.meta.url));
}
