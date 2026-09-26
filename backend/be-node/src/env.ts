import { fileURLToPath } from 'node:url';

/**
 * Il primo import del server: carica `.env` e fissa il fuso dell'app prima che qualunque
 * modulo del dominio crei i suoi formattatori di date, che il fuso lo leggono una volta sola.
 */
try {
  process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
} catch {
  /* nessun .env: le variabili arrivano dall'ambiente */
}
process.env.TZ = process.env.APP_TIME_ZONE || 'Europe/Rome';
