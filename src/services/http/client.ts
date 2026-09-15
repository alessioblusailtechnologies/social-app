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

  async function send(method: Method, path: string, body: unknown, accessToken: string | null): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json' };
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

  async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
    const current = useSessionStore.getState().tokens;
    if (current && current.expiresAt - REFRESH_MARGIN_MS <= Date.now()) await refresh();

    const token = () => useSessionStore.getState().tokens?.accessToken ?? null;
    if (!token()) throw new ApiError(401, 'UNAUTHENTICATED', 'Sessione scaduta: accedi di nuovo.');

    let response = await send(method, path, body, token());
    if (response.status === 401) {
      if (!(await refresh())) return parse<T>(response);
      response = await send(method, path, body, token());
      if (response.status === 401) endSession();
    }
    return parse<T>(response);
  }

  return {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    put: (path, body) => request('PUT', path, body),
    patch: (path, body) => request('PATCH', path, body),
    delete: (path) => request('DELETE', path),
    publicPost: async (path, body) => parse(await send('POST', path, body, null)),
  };
}
