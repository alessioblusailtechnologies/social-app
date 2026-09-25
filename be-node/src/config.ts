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
  /**
   * Un Claude, servito da Anthropic, o un modello di un fornitore terzo elencato in `ai/providers.ts`.
   * Senza la chiave del suo fornitore le rotte AI rispondono 503 e il resto dell'API funziona.
   */
  AI_MODEL: z.string().min(1).default('claude-opus-5'),
  ANTHROPIC_API_KEY: optionalString,
  /** DeepSeek diretta, per i modelli `deepseek-*`: API compatibile con Anthropic, server in Cina. */
  DEEPSEEK_API_KEY: optionalString,
  DEEPSEEK_BASE_URL: z.url().default('https://api.deepseek.com/anthropic'),
  /** Le generazioni; i ritocchi rapidi girano sempre a `low`. */
  AI_EFFORT: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('medium'),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(240_000),
  AI_MAX_BUDGET_USD: z.coerce.number().positive().default(1),
  /** Le foto dei visivi (Gemini, Nano Banana). Senza, crearle risponde 503; le card senza foto funzionano. */
  GEMINI_API_KEY: optionalString,
  /** Nano Banana 2 di base; `gemini-3-pro-image` per il Pro. */
  IMAGE_MODEL: z.string().min(1).default('gemini-3.1-flash-image'),
  /** Il modello che guarda le immagini di riferimento dello stile, con la stessa chiave di Gemini. */
  VISION_MODEL: z.string().min(1).default('gemini-3.5-flash'),
  /**
   * La linea grafica del passo «Come appare»: un Claude che vede i riferimenti e decide, con ANTHROPIC_API_KEY.
   * Senza la chiave la fanno Gemini (che guarda) e il modello dei testi (che scrive).
   */
  DESIGN_MODEL: z.string().min(1).default('claude-opus-5'),
  DESIGN_EFFORT: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('high'),
  /** Lo scontorno (fal, BiRefNet). Senza, i layout con soggetto scontornato non si creano. */
  FAL_KEY: optionalString,
  /** La musica dei video (ElevenLabs Music). Senza, i video si montano senza musica. */
  ELEVENLABS_API_KEY: optionalString,
  MUSIC_MODEL: z.string().min(1).default('music_v2_5'),
  /** Il servizio che compone i PNG delle card (be-render). Su Render arriva come `host:porta` del servizio privato. */
  RENDER_URL: z.preprocess(
    (value) => (value === '' ? undefined : typeof value === 'string' && !/^https?:\/\//.test(value) ? `http://${value}` : value),
    z.url().default('http://localhost:3020'),
  ),
  /** Il segreto condiviso con be-render, se lo chiede. */
  RENDER_TOKEN: optionalString,
  /** Quanto aspettare un PNG: sul piano gratuito be-render si addormenta e il primo scatto dopo una pausa è lento. */
  RENDER_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  /** Il bucket privato di Supabase Storage con foto, scontorni e PNG. */
  MEDIA_BUCKET: z.string().min(1).default('presenza-media'),
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
