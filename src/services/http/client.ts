import type { AiStreamEvent, OnAiSteps } from '../types';
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
  /** Una POST con risposta a passi (Server-Sent Events): i passi vanno a `onSteps` man mano, poi arriva il risultato. */
  stream<T>(path: string, body: unknown, onSteps?: OnAiSteps): Promise<T>;
  /** Le rotte di accesso: nessun token, nessun rinnovo. */
  publicPost<T>(path: string, body: unknown): Promise<T>;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Il token si rinnova un minuto prima che scada, così una richiesta lenta non parte già morta. */
const REFRESH_MARGIN_MS = 60_000;

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

  async function stream<T>(path: string, body: unknown, onSteps?: OnAiSteps): Promise<T> {
    const response = await authorized('POST', path, body, 'text/event-stream');
    if (!response.ok) return parse<T>(response);

    let outcome: AiStreamEvent<T> | null = null;
    const dispatch = (block: string) => {
      const data = block
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (!data) return;
      const event = JSON.parse(data) as AiStreamEvent<T>;
      if (event.type === 'steps') onSteps?.(event.steps);
      else outcome = event;
    };

    try {
      const reader = response.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
          for (let end = buffer.indexOf('\n\n'); end >= 0; end = buffer.indexOf('\n\n')) {
            dispatch(buffer.slice(0, end));
            buffer = buffer.slice(end + 2);
          }
        }
        dispatch(buffer);
      } else {
        // Senza lettura a pezzi i passi arrivano tutti insieme alla fine: il risultato resta giusto.
        (await response.text()).split(/\r?\n\r?\n/).forEach(dispatch);
      }
    } catch {
      throw new ApiError(0, 'NETWORK', 'La connessione si è interrotta. Controlla la rete e riprova.');
    }

    const result = outcome as AiStreamEvent<T> | null;
    if (result?.type === 'result') return result.result;
    if (result?.type === 'error') throw new ApiError(result.status, result.code, result.message);
    throw new ApiError(0, 'NETWORK', 'La risposta si è interrotta. Riprova.');
  }

  return {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    put: (path, body) => request('PUT', path, body),
    patch: (path, body) => request('PATCH', path, body),
    delete: (path) => request('DELETE', path),
    stream,
    publicPost: async (path, body) => parse(await send('POST', path, body, null)),
  };
}
