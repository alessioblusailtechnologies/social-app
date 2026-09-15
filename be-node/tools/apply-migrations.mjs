#!/usr/bin/env node
/**
 * Applica al progetto Supabase le migrazioni di `supabase/migrations` che non
 * sono ancora nel registro `presenza.schema_migrations`, in ordine di nome.
 *
 *   node tools/apply-migrations.mjs          applica quelle mancanti
 *   node tools/apply-migrations.mjs --list   elenca quelle registrate
 *
 * Passa dalla Management API (SUPABASE_ACCESS_TOKEN e SUPABASE_PROJECT_REF da
 * be-node/.env), come in assieme. Il registro è di Presenza e non quello di
 * Supabase, che appartiene a Velia: mescolarli farebbe fallire le sue migrazioni.
 *
 * Ogni migrazione viaggia in un'unica query insieme alla sua riga di registro:
 * o passano tutte e due o nessuna. Le variabili della shell vincono su `.env`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
} catch {
  /* in CI le variabili arrivano dall'ambiente */
}

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;
if (!token || !ref) {
  console.error('Servono SUPABASE_ACCESS_TOKEN e SUPABASE_PROJECT_REF in be-node/.env');
  process.exit(1);
}

const MIGRATIONS = new URL('../supabase/migrations/', import.meta.url);

async function query(sql) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Management API ${response.status}: ${body}`);
  return body ? JSON.parse(body) : [];
}

async function appliedVersions() {
  const [ledger] = await query(`select to_regclass('presenza.schema_migrations') is not null as present`);
  if (!ledger?.present) return new Map();
  const rows = await query('select version, name, applied_at from presenza.schema_migrations order by version');
  return new Map(rows.map((row) => [row.version, row]));
}

async function main(argument) {
  const applied = await appliedVersions();

  if (argument === '--list') {
    if (applied.size === 0) console.log('Nessuna migrazione registrata.');
    for (const row of applied.values()) console.log(`${row.version}  ${row.name}  ${row.applied_at}`);
    return;
  }

  const files = readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  let count = 0;
  for (const file of files) {
    const match = /^(\d{14})_([a-z0-9_]+)\.sql$/.exec(file);
    if (!match) throw new Error(`Nome non conforme (atteso YYYYMMDDHHMMSS_nome.sql): ${file}`);
    const [, version, name] = match;
    if (applied.has(version)) continue;

    const sql = readFileSync(new URL(file, MIGRATIONS), 'utf8');
    console.log(`Applico ${file} al progetto ${ref}…`);
    // Versione e nome passano già dall'espressione regolare: le virgolette semplici bastano.
    await query(`${sql}\n;\ninsert into presenza.schema_migrations (version, name) values ('${version}', '${name}');`);
    console.log(`Fatto: ${version} (${name}).`);
    count += 1;
  }
  if (count === 0) console.log('Niente da applicare: il database è allineato.');
}

await main(process.argv[2]);
