import { fileURLToPath } from 'node:url';

/**
 * Il primo import del server. Le variabili stanno in due file e non se le contendono:
 * l'infrastruttura (Supabase, database, chiavi) resta quella di `be-node/.env`, così i due backend
 * parlano allo stesso progetto e agli stessi dati; qui sopra si aggiungono solo le manopole
 * dell'agente, tutte con prefisso `AGENT_`.
 */
for (const path of ['../../be-node/.env', '../.env']) {
  try {
    process.loadEnvFile(fileURLToPath(new URL(path, import.meta.url)));
  } catch {
    /* il file può mancare: le variabili arrivano dall'ambiente */
  }
}
process.env.TZ = process.env.APP_TIME_ZONE || 'Europe/Rome';
