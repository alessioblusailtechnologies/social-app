import { spawn } from 'node:child_process';

import type { FastifyBaseLogger } from 'fastify';

/**
 * Il token con cui si entra nel loro MCP, tenuto fresco.
 *
 * Higgsfield per l'MCP non dà chiavi: l'unica credenziale è la sessione del loro CLI, e dura poco.
 * Il giro di rinnovo si potrebbe rifare noi — è Clerk sotto — ma vorrebbe dire un cookie estratto
 * dal browser e un endpoint che non sta nemmeno nella OpenAPI pubblica di Clerk: si romperebbe al
 * primo cambio loro. Così invece il token si chiede al loro CLI, che è il client supportato e la
 * rotazione la fa già per conto suo: noi lo interroghiamo prima di ogni generazione e teniamo il
 * risultato finché vale.
 *
 * Quando la sessione è finita davvero non si lancia niente di drammatico: chi chiama se ne accorge,
 * lo dice nei log, e genera senza. Una sessione scaduta da loro non deve fermare le nostre bozze.
 */

export interface HiggsfieldAuth {
  /** Un token valido adesso. Lancia se la sessione non c'è più. */
  token(): Promise<string>;
}

/** Il bearer messo a mano in `.env`: serve per la prima prova, prima ancora che il CLI ci sia. */
export function staticAuth(token: string): HiggsfieldAuth {
  return { token: () => Promise.resolve(token) };
}

export interface CliAuthOptions {
  /** L'eseguibile del loro CLI: `higgsfield`, oppure `hf`. */
  command: string;
  /**
   * Cosa gli si chiede. Il loro `auth` fa «login / logout / inspect token», ma il binario è chiuso
   * e il nome esatto del sottocomando non è scritto da nessuna parte: se non è questo si cambia
   * da `.env`, senza toccare il codice.
   */
  args: string[];
  log: FastifyBaseLogger;
}

/**
 * Il token che il CLI stampa è opaco — `oat_…`, un access token OAuth — quindi dentro non c'è
 * nessuna scadenza da leggere: quando rinnovare lo sa solo lui. Ma chiederglielo costa tre decimi
 * di secondo, così la regola è semplice: glielo si richiede di continuo e si tiene in mano giusto
 * il tempo di non lanciare un processo per ogni chiamata.
 */
const CACHE_MS = 60_000;

export function cliAuth(options: CliAuthOptions): HiggsfieldAuth {
  let cached: { token: string; until: number } | null = null;
  let pending: Promise<string> | null = null;
  let announced = false;

  const mint = async (): Promise<string> => {
    const output = await run(options);
    // L'ultima riga con qualcosa dentro: un token non ha spazi, i messaggi del CLI sì.
    const token = output
      .split('\n')
      .map((line) => line.trim())
      .findLast((line) => line.length >= 16 && !/\s/.test(line));
    if (!token) throw new Error(`${options.command} ${options.args.join(' ')} non ha stampato nessun token`);

    cached = { token, until: Date.now() + CACHE_MS };
    if (!announced) {
      announced = true;
      options.log.info('sessione higgsfield aperta');
    }
    return token;
  };

  return {
    async token() {
      if (cached && cached.until > Date.now()) return cached.token;
      // Due generazioni che partono insieme chiedono un token solo.
      pending ??= mint().finally(() => {
        pending = null;
      });
      return pending;
    },
  };
}

function run(options: CliAuthOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    // Su Windows il CLI si installa come `.cmd` e senza shell non parte; gli argomenti vanno nella
    // riga di comando invece che nell'array, o Node avvisa che con la shell non li protegge.
    // Vengono da `.env`, non dagli utenti, ma tanto vale non lasciare l'avviso in giro.
    const child =
      process.platform === 'win32'
        ? spawn([options.command, ...options.args].join(' '), { shell: true, windowsHide: true })
        : spawn(options.command, options.args, { windowsHide: true });
    let out = '';
    let err = '';
    const timer = setTimeout(() => child.kill(), 30_000);

    child.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      err += chunk.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(new Error(`${options.command} non si avvia: ${error.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`${options.command} esce con ${code}: ${(err || out).trim().slice(0, 200)}`));
    });
  });
}
