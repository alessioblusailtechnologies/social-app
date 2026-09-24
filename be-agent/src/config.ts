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
  /**
   * Come si entra nel server MCP di Higgsfield. Il loro OAuth verso Claude Code oggi non passa, ma
   * la risorsa accetta il bearer di una sessione del loro CLI: si fa `higgsfield auth login` una
   * volta, e prima di ogni generazione il token lo chiediamo al CLI, che lo tiene fresco.
   * Un token messo a mano qui sotto scavalca il CLI: comodo per la prima prova, scade in fretta.
   * Senza né l'uno né l'altro il server resta spento e l'agente non ne vede gli strumenti.
   */
  AGENT_HIGGSFIELD_TOKEN: z.string().min(1).optional(),
  AGENT_HIGGSFIELD_CLI: z.string().min(1).default('higgsfield'),
  /** Il sottocomando che stampa il token: se il loro CLI lo chiama diversamente, si cambia qui. */
  AGENT_HIGGSFIELD_CLI_ARGS: z.string().default('auth token'),
  AGENT_HIGGSFIELD_URL: z.url().default('https://mcp.higgsfield.ai/mcp'),
  /**
   * Con che modello si fanno le foto, ora che non le fa più Gemini di qua. Nome e identificativo
   * insieme: il nome regge se cambiano gli id, l'id evita che debba cercarlo nel catalogo.
   *
   * Pro e non la 2 perché a parità di risoluzione costano lo stesso (2 crediti a 2K), il 4:5 ce
   * l'ha nativo, ed esegue la descrizione invece di arricchirla: la 2 ci aggiungeva posate e
   * tovaglioli, che su una card finiscono sotto il titolo.
   */
  AGENT_HIGGSFIELD_IMAGE_MODEL: z.string().min(1).default('Nano Banana Pro (nano_banana_pro)'),
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
