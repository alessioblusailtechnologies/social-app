import { fileURLToPath } from 'node:url';

import { z } from 'zod';

/**
 * Configurazione dal solo ambiente, validata all'avvio: un processo configurato male
 * deve morire subito con un messaggio chiaro, non fallire alla prima richiesta.
 */

/** Una variabile lasciata vuota in `.env` vale come assente. */
const optionalString = z.preprocess((value) => (value === '' ? undefined : value), z.string().min(1).optional());

const envSchema = z.object({
  /** https://<ref>.supabase.co */
  SUPABASE_URL: z.url(),
  /** Chiave pubblica: il token endpoint di Auth la vuole per accesso e rinnovo. */
  SUPABASE_ANON_KEY: z.string().min(1),
  /** Solo per la registrazione (Admin API di Auth). */
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  /** Progetti con chiavi JWT legacy (HS256): senza, i token si verificano col JWKS del progetto. */
  SUPABASE_JWT_SECRET: optionalString,
  /** Ruolo `presenza_app` dal pooler in modalità sessione. */
  DATABASE_URL: z.string().min(1),
  /** Senza chiave le rotte AI rispondono 503 e il resto dell'API funziona. */
  ANTHROPIC_API_KEY: optionalString,
  AI_MODEL: z.string().min(1).default('claude-opus-5'),
  /** Le generazioni; i ritocchi rapidi girano sempre a `low`. */
  AI_EFFORT: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('medium'),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(240_000),
  AI_MAX_BUDGET_USD: z.coerce.number().positive().default(1),
  /** In locale; in produzione la porta la assegna la piattaforma in `PORT` (vedi server.ts). */
  API_PORT: z.coerce.number().int().default(3010),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  /** Origini del FE ammesse, separate da virgola. Vuota = niente CORS. */
  CORS_ORIGINS: optionalString,
  /** Le date del piano sono di calendario: "oggi" e "già uscita" si decidono in questo fuso. */
  APP_TIME_ZONE: z.string().min(1).default('Europe/Rome'),
});

export type Config = z.infer<typeof envSchema>;

let cache: Config | undefined;

export function config(): Config {
  if (!cache) {
    // Da `src/` il file è un livello sopra, e così da `dist/`. In produzione le variabili arrivano dalla piattaforma.
    try {
      process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
    } catch {
      /* nessun .env: va bene così */
    }
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const fields = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
      throw new Error(`Configurazione mancante o non valida (${fields}). Copia .env.example in .env e compilalo.`);
    }
    cache = parsed.data;
    // Il dominio condiviso col FE ragiona in ora locale: il processo la prende dal fuso dell'app.
    process.env.TZ = cache.APP_TIME_ZONE;
  }
  return cache;
}
