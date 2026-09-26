import type { AiStep, JobView, OnAiSteps } from '@shared/services/types';
import { endSession, updateTokens, useSessionStore, type TokenResponse } from './session';

/** L'errore del backend, con il codice stabile e il messaggio da mostrare: `{ code, message }`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Il messaggio del server quando c'è, altrimenti il testo di ripiego della schermata. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

export interface ApiClient {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  put<T>(path: string, body?: unknown): Promise<T>;
  patch<T>(path: string, body?: unknown): Promise<T>;
  delete(path: string): Promise<void>;
  /**
   * Una generazione lunga: la POST la mette in coda, poi si rilegge il lavoro finché non
   * finisce. I passi vanno a `onSteps` man mano. Chiudere l'app o perdere la rete non
   * ferma niente: il lavoro sta sul server e si può riprendere con `follow`.
   */
  job<T>(path: string, body: unknown, onSteps?: OnAiSteps): Promise<T>;
  /** Si rimette a guardare un lavoro già in corso. */
  follow<T>(jobId: string, onSteps?: OnAiSteps): Promise<T>;
  /** Le rotte di accesso: nessun token, nessun rinnovo. */
  publicPost<T>(path: string, body: unknown): Promise<T>;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Il token si rinnova un minuto prima che scada, così una richiesta lenta non parte già morta. */
const REFRESH_MARGIN_MS = 60_000;

/** Ogni quanto si chiede a che punto è una generazione: i passi cambiano ogni pochi secondi. */
const POLL_MS = 1500;
const MAX_POLL_MS = 10_000;
/** Tentativi a vuoto di fila (telefono senza rete, server giù) prima di smettere di aspettare. */
const LOST_TRIES = 12;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** I passi si ridisegnano solo quando cambiano: testo e stato di ognuno, in fila. */
const summarize = (steps: AiStep[]) => steps.map((step) => `${step.id}${step.status}${step.detail ?? ''}`).join('|');

/** "/brands/" + id: i segmenti interpolati si codificano, gli id arrivano anche dai link. */
export function route(strings: TemplateStringsArray, ...segments: string[]): string {
  return strings.reduce((path, part, i) => path + part + (i < segments.length ? encodeURIComponent(segments[i]) : ''), '');
}

export function createApiClient(baseUrl: string): ApiClient {
  let refreshing: Promise<boolean> | null = null;

  async function send(
    method: Method,
    path: string,
    body: unknown,
    accessToken: string | null,
    accept = 'application/json',
  ): Promise<Response> {
    const headers: Record<string, string> = { Accept: accept };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    try {
      return await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, 'NETWORK', 'Non riesco a raggiungere il server. Controlla la connessione e riprova.');
    }
  }

  async function parse<T>(response: Response): Promise<T> {
    if (response.ok) {
      if (response.status === 204) return undefined as T;
      return (await response.json()) as T;
    }
    const payload = (await response.json().catch(() => null)) as { code?: unknown; message?: unknown } | null;
    throw new ApiError(
      response.status,
      typeof payload?.code === 'string' ? payload.code : 'HTTP_ERROR',
      typeof payload?.message === 'string' ? payload.message : 'Il servizio non risponde. Riprova tra poco.',
    );
  }

  /**
   * Un solo rinnovo alla volta: le query che scoprono insieme il token scaduto aspettano lo stesso.
   * Se il server rifiuta il refresh token la sessione è finita; se manca la rete no, si riprova dopo.
   */
  function refresh(): Promise<boolean> {
    refreshing ??= (async () => {
      try {
        const tokens = useSessionStore.getState().tokens;
        if (!tokens) return false;
        const response = await send('POST', '/auth/refresh', { refreshToken: tokens.refreshToken }, null);
        if (!response.ok) {
          if (response.status >= 400 && response.status < 500) endSession();
          return false;
        }
        updateTokens((await response.json()) as TokenResponse);
        return true;
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  /** La risposta di una rotta protetta, dopo l'eventuale rinnovo del token. */
  async function authorized(method: Method, path: string, body: unknown, accept?: string): Promise<Response> {
    const current = useSessionStore.getState().tokens;
    if (current && current.expiresAt - REFRESH_MARGIN_MS <= Date.now()) await refresh();

    const token = () => useSessionStore.getState().tokens?.accessToken ?? null;
    if (!token()) throw new ApiError(401, 'UNAUTHENTICATED', 'Sessione scaduta: accedi di nuovo.');

    let response = await send(method, path, body, token(), accept);
    if (response.status === 401) {
      if (!(await refresh())) return response;
      response = await send(method, path, body, token(), accept);
      if (response.status === 401) endSession();
    }
    return response;
  }

  async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
    return parse<T>(await authorized(method, path, body));
  }

  /**
   * Guarda un lavoro finché non finisce. La rete che va e viene non lo interrompe: il lavoro
   * sta sul server, quindi una lettura andata male si riprova, sempre più piano, e solo dopo
   * una serie di tentativi a vuoto si dice che non si riesce più a seguirlo. Si contano i
   * tentativi e non il tempo passato: col telefono addormentato il tempo passa senza che si
   * sia provato niente, e al risveglio non è il momento di arrendersi.
   */
  async function follow<T>(jobId: string, onSteps?: OnAiSteps): Promise<T> {
    let told = '';
    let failures = 0;
    for (;;) {
      let job: JobView<T>;
      try {
        job = await request<JobView<T>>('GET', route`/jobs/${jobId}`);
        failures = 0;
      } catch (error) {
        const unreachable = error instanceof ApiError && (error.status === 0 || error.status >= 500);
        if (!unreachable || (failures += 1) >= LOST_TRIES) throw error;
        await wait(Math.min(POLL_MS * 2 ** Math.min(failures, 3), MAX_POLL_MS));
        continue;
      }

      // La lista arriva intera a ogni giro: si ridisegna solo quando è cambiata davvero.
      const signature = summarize(job.steps);
      if (signature !== told) {
        told = signature;
        onSteps?.(job.steps);
      }

      if (job.status === 'done') return job.result as T;
      if (job.status === 'failed' && job.error) throw new ApiError(job.error.status, job.error.code, job.error.message);
      if (job.status === 'failed') throw new ApiError(500, 'JOB_FAILED', 'La generazione non è riuscita. Riprova.');
      if (job.status === 'canceled') throw new ApiError(0, 'JOB_CANCELED', 'Generazione annullata.');
      await wait(POLL_MS);
    }
  }

  async function job<T>(path: string, body: unknown, onSteps?: OnAiSteps): Promise<T> {
    const { jobId } = await request<{ jobId: string }>('POST', path, body);
    return follow<T>(jobId, onSteps);
  }

  return {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    put: (path, body) => request('PUT', path, body),
    patch: (path, body) => request('PATCH', path, body),
    delete: (path) => request('DELETE', path),
    job,
    follow,
    publicPost: async (path, body) => parse(await send('POST', path, body, null)),
  };
}
