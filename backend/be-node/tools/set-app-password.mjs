#!/usr/bin/env node
/**
 * Dà una password nuova al ruolo `presenza_app` e scrive DATABASE_URL in `.env`.
 *
 *   node tools/set-app-password.mjs
 *
 * La password non lascia la macchina in chiaro: al database arriva già cifrata
 * (SCRAM-SHA-256, come la calcola `\password` di psql). Serve dopo la prima
 * migrazione e ogni volta che si vuole ruotarla; la connessione passa dal pooler
 * in modalità sessione (porta 5432), come quella di Velia.
 */
import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ENV_FILE = fileURLToPath(new URL('../.env', import.meta.url));

try {
  process.loadEnvFile(ENV_FILE);
} catch {
  /* variabili già nell'ambiente */
}

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;
const host = process.env.SUPABASE_POOLER_HOST;
if (!token || !ref || !host) {
  console.error('Servono SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF e SUPABASE_POOLER_HOST in be-node/.env');
  process.exit(1);
}

/** Il verificatore SCRAM-SHA-256 che Postgres accetta al posto della password (RFC 5802). */
function scramVerifier(password) {
  const iterations = 4096;
  const salt = randomBytes(16);
  const salted = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  const clientKey = createHmac('sha256', salted).update('Client Key').digest();
  const storedKey = createHash('sha256').update(clientKey).digest();
  const serverKey = createHmac('sha256', salted).update('Server Key').digest();
  return `SCRAM-SHA-256$${iterations}:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`;
}

// Solo caratteri sicuri in un URL: niente percent-encoding da ricordare.
const password = randomBytes(24).toString('base64url');

const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify({ query: `alter role presenza_app with login password '${scramVerifier(password)}'` }),
});
if (!response.ok) {
  console.error(`Management API ${response.status}: ${await response.text()}`);
  process.exitCode = 1;
} else {
  const url = `postgresql://presenza_app.${ref}:${password}@${host}:5432/postgres`;
  let env = '';
  try {
    env = readFileSync(ENV_FILE, 'utf8');
  } catch {
    /* il file nasce qui */
  }
  env = /^DATABASE_URL=.*$/m.test(env)
    ? env.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${url}`)
    : `${env.trimEnd()}\nDATABASE_URL=${url}\n`;
  writeFileSync(ENV_FILE, env);
  console.log('Password di presenza_app aggiornata; DATABASE_URL scritto in be-node/.env.');
}
