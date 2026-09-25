import type { HookCallback, McpHttpServerConfig } from '@anthropic-ai/claude-agent-sdk';
import type { FastifyBaseLogger } from 'fastify';

import { fetchPublicBytes } from '../../be-node/src/lib/public-url';
import type { MediaStorage } from '../../be-node/src/media/storage';
import { MEDIA_EXTENSIONS, mediaPath } from '../../be-node/src/visual/files';

/**
 * Higgsfield come server MCP remoto: non una manciata di modelli, la loro app intera — Marketing
 * Studio, Shorts Studio, i personaggi allenati, le voci, l'upscale, il doppiaggio.
 *
 * È un MCP scritto per una chat, e due cose vanno sistemate perché regga dentro un server.
 *
 * La prima sono i tool che non generano niente. Là dentro c'è chi pubblica su TikTok, chi compra
 * crediti, chi apre una shell su una macchina remota, chi legge le variabili d'ambiente di un sito.
 * L'agente gira coi permessi scavalcati, senza nessuno che guardi, su testi che arrivano dagli
 * utenti: quei tool non li deve proprio vedere. Non è una museruola sulle funzionalità — dentro
 * resta tutto ciò che genera — è il confine tra generare e agire sul mondo.
 *
 * La seconda sono i file. Higgsfield risponde con indirizzi suoi, che scadono. Qui ogni file che
 * passa in un risultato viene copiato nella libreria del brand, e all'agente si dice il percorso
 * nostro: così quando consegna, quello che indica esiste ancora domani.
 */

export function higgsfieldServer(options: { url: string; token: string }): McpHttpServerConfig {
  return {
    type: 'http',
    url: options.url,
    // Il token è di sessione e dura poco: si conia prima di ogni run, non si tiene nel processo.
    headers: { Authorization: `Bearer ${options.token}` },
    // Un video si aspetta in minuti, e `jobs_wait` tiene aperta la chiamata fino in fondo.
    timeout: 600_000,
  };
}

const PREFISSO = 'mcp__higgsfield__';

/**
 * Tolti dal contesto prima ancora che il modello li veda: `disallowedTools` li rimuove, non li
 * rifiuta. I nomi sono quelli veri, letti dal server (`npm run higgsfield` li stampa); il carattere
 * jolly vale come prefisso, quindi `tiktok_*` prende tutta la famiglia ma `website_*` non prende
 * `list_website_categories`, che va nominato. Sotto resta comunque `guardHiggsfield`.
 */
export const higgsfieldDenied = [
  `${PREFISSO}tiktok_*`,
  `${PREFISSO}website_*`,
  `${PREFISSO}create_website`,
  `${PREFISSO}deploy_website`,
  `${PREFISSO}publish_website`,
  `${PREFISSO}rename_website`,
  `${PREFISSO}list_websites`,
  `${PREFISSO}list_website_categories`,
  `${PREFISSO}sandbox_exec`,
  // Python eseguito sulla loro macchina: è il costruttore di scene 3D, ma è pur sempre codice.
  `${PREFISSO}scene_builder_3d_run_python`,
  `${PREFISSO}scene_builder_3d_query_python`,
  // Invocare app del loro marketplace «come l'utente» è chiuso: cercarle e descriverle porta solo lì.
  `${PREFISSO}apps_invoke`,
  `${PREFISSO}apps_search`,
  `${PREFISSO}apps_describe`,
  `${PREFISSO}confirm_billing_purchase`,
  `${PREFISSO}cancel_trial_auto_renewal`,
  `${PREFISSO}confirm_trial_cancel`,
  // Cambiare workspace significa scalare i crediti da un'altra parte: si resta dove siamo.
  `${PREFISSO}select_workspace`,
  `${PREFISSO}participate_in_contest`,
  `${PREFISSO}sync_agents`,
];

/**
 * La stessa regola detta per intenzione invece che per nome: i nomi dei tool cambiano, «pubblica»,
 * «paga» e «esegui» no. Vale come rete sotto la lista, perché un tool nuovo che non abbiamo
 * previsto arriva senza avvisare.
 */
const AGISCE = /publish|deploy|billing|purchase|checkout|trial|website|sandbox|secret|repo|python|apps_invoke|contest|tiktok|sync_agents/i;

export function guardHiggsfield(log: FastifyBaseLogger): HookCallback {
  return async (input) => {
    if (input.hook_event_name !== 'PreToolUse' || !input.tool_name.startsWith(PREFISSO)) return {};
    if (!AGISCE.test(input.tool_name.slice(PREFISSO.length))) return {};
    log.warn({ tool: input.tool_name }, 'strumento fuori dalla generazione: negato');
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: 'Qui si genera soltanto: pubblicare, pagare o eseguire comandi non è il tuo compito.',
      },
    };
  };
}

// ---------------------------------------------------------------------------
// I file che tornano indietro
// ---------------------------------------------------------------------------

export interface MirrorContext {
  accountId: string;
  brandId: string;
  storage: MediaStorage;
  log: FastifyBaseLogger;
  /** Gli indirizzi già copiati, per percorso: `job_status` si richiama, i file no. */
  saved: Map<string, string>;
  /**
   * La cartella di lavoro, quando c'è: lì dentro il file ci finisce anche come file vero, sotto
   * `media/`. Serve a chi monta, che con un percorso dello Storage non ci fa niente e con un
   * indirizzo firmato dovrebbe scaricarselo di nuovo.
   */
  dir?: string;
}

/** Un video 4K da quindici secondi ci sta; oltre, è qualcosa che non volevamo scaricare. */
const MAX_BYTES = 64 * 1024 * 1024;

/** Quanti file da un risultato solo: un batch ne può produrre tanti, ma non si copia una libreria. */
const MAX_FILES = 8;

const TYPE_BY_EXTENSION: Record<string, string> = {
  ...Object.fromEntries(Object.entries(MEDIA_EXTENSIONS).map(([type, extension]) => [extension, type])),
  jpeg: 'image/jpeg',
};

/**
 * Sfogliare non è produrre. Aprire la cronologia, la libreria di media o i preset fa passare
 * davanti decine di file di altri lavori: quelli servono sul disco, se l'agente li vuole usare, ma
 * nella libreria del brand non ci devono finire. Là dentro ci va quello che questo lavoro produce,
 * più quello che l'agente consegna apposta.
 */
const SFOGLIA = /^(show_(?!generation_by_ids)|list_|get_|models_explore|presets_show|transactions|balance|animation_actions|video_analysis_jobs)/;

export function mirrorMedia(context: MirrorContext): HookCallback {
  return async (input) => {
    if (input.hook_event_name !== 'PostToolUse' || !input.tool_name.startsWith(PREFISSO)) return {};
    const browsing = SFOGLIA.test(input.tool_name.slice(PREFISSO.length));
    // Se sta sfogliando e non c'è nemmeno una cartella dove posare i file, non c'è niente da fare.
    if (browsing && !context.dir) return {};

    const urls = mediaUrls(input.tool_response).filter((url) => !context.saved.has(url));
    if (urls.length === 0) return {};

    const paths: string[] = [];
    for (const url of urls.slice(0, MAX_FILES)) {
      try {
        const file = await fetchPublicBytes(url, MAX_BYTES);
        // Il tipo dichiarato vale se lo conosciamo; molte CDN dicono `application/octet-stream`
        // e allora decide l'estensione, che è come l'avevamo trovato l'indirizzo.
        const type = MEDIA_EXTENSIONS[file.contentType] ? file.contentType : typeFromUrl(url);
        if (!type) continue;
        const name = mediaPath(context.accountId, context.brandId, type);
        const onDisk = context.dir ? await alsoOnDisk(context.dir, name, file.bytes) : null;
        if (browsing) {
          // Solo sul disco: il file c'è se gli serve, ma la libreria del brand resta pulita.
          context.saved.set(url, onDisk!);
          paths.push(onDisk!);
          continue;
        }
        await context.storage.upload(name, file.bytes, type);
        context.saved.set(url, name);
        paths.push(onDisk ? `${name}  →  ${onDisk}` : name);
      } catch (error) {
        context.log.warn({ err: error, url }, 'file non copiato');
      }
    }
    if (paths.length === 0) return {};

    context.log.info({ tool: input.tool_name, files: paths.length, browsing }, 'file copiati');
    return {
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: browsing
          ? `Questi file te li ho messi nella cartella di lavoro, non in libreria — li stavi solo guardando:\n${paths.join('\n')}\n\nSe uno di questi entra nel lavoro, consegnalo.`
          : context.dir
            ? `Questi file sono nella libreria del brand, e come file nella cartella di lavoro:\n${paths.join('\n')}\n\nPer montarli usa il file; nella risposta indica il percorso della libreria. Gli indirizzi qui sopra scadono.`
            : `Questi file sono già nella libreria del brand:\n${paths.join('\n')}\n\nQuando consegni indica questi percorsi: gli indirizzi qui sopra scadono.`,
      },
    };
  };
}

/** Lo stesso file, anche sul disco della cartella di lavoro: chi monta ha bisogno di un file, non di un percorso. */
async function alsoOnDisk(dir: string, path: string, bytes: Uint8Array): Promise<string> {
  const { mkdir, writeFile } = await import('node:fs/promises');
  const { basename, join } = await import('node:path');
  await mkdir(join(dir, 'media'), { recursive: true });
  const name = join('media', basename(path));
  await writeFile(join(dir, name), bytes);
  return name.replace(/\\/g, '/');
}

/** Gli indirizzi di file dentro un risultato, qualunque forma abbia: si guarda il testo crudo. */
function mediaUrls(response: unknown): string[] {
  let raw: string;
  try {
    raw = typeof response === 'string' ? response : JSON.stringify(response);
  } catch {
    return [];
  }
  if (!raw) return [];

  const found = new Set<string>();
  for (const match of raw.matchAll(/https?:\/\/[^\s"'`<>()\\]+/g)) {
    const url = match[0].replace(/[.,;:]+$/, '');
    if (typeFromUrl(url)) found.add(url);
  }
  return [...found];
}

function typeFromUrl(url: string): string | null {
  try {
    const extension = new URL(url).pathname.split('.').pop()?.toLowerCase() ?? '';
    return TYPE_BY_EXTENSION[extension] ?? null;
  } catch {
    return null;
  }
}

/**
 * Non si esce a mani vuote. Un fotogramma si fa in secondi, una clip in minuti, e un agente abituato a parlare con
 * qualcuno se la cava dicendo «ricontrollo tra poco»: qui dall'altra parte non c'è nessuno, e la clip resterebbe
 * pagata e persa. La chiusura si rifiuta finché nella libreria non è arrivato un file; oltre i tentativi, comanda
 * `maxTurns`.
 */
export function waitBeforeLeaving(context: { generated: Map<string, string>; log: FastifyBaseLogger }, max = 3): HookCallback {
  let blocked = 0;
  return async (input) => {
    if (input.hook_event_name !== 'Stop' || context.generated.size > 0 || blocked >= max) return {};
    blocked += 1;
    context.log.info({ tentativo: blocked }, 'uscita rimandata: non è arrivato nessun file');
    return {
      decision: 'block',
      reason:
        'Non è ancora arrivato nessun file, e questa sessione non ha nessuno dall’altra parte: se te ne vai adesso quello che hai ' +
        'chiesto resta pagato e perso. Se il lavoro è in corso aspettalo con jobs_wait, che tiene aperta la chiamata, poi rispondi col percorso.',
    };
  };
}
