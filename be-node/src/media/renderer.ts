import type { CardProps } from '@/templates/types';

import { ApiError } from '../contract/errors';

/**
 * Il client di be-render: le stesse props dei template che l'app disegna dal vivo, e in cambio il PNG composto
 * da Remotion. Il servizio è senza stato: foto e scontorno gli arrivano come indirizzi firmati.
 */

export interface CardRenderer {
  render(props: CardProps): Promise<Uint8Array>;
}

export const unavailableRenderer: CardRenderer = {
  render: () =>
    Promise.reject(ApiError.unavailable('RENDER_UNAVAILABLE', 'Il servizio che compone le card non è configurato su questo server.')),
};

export interface HttpRendererOptions {
  baseUrl: string;
  token?: string | undefined;
  timeoutMs?: number;
}

export function httpRenderer(options: HttpRendererOptions): CardRenderer & { health(): Promise<boolean> } {
  const base = options.baseUrl.endsWith('/') ? options.baseUrl : `${options.baseUrl}/`;
  const url = (path: string) => new URL(path, base);

  return {
    async render(props) {
      let response: Response;
      try {
        response = await fetch(url('render'), {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(options.token ? { 'x-render-token': options.token } : {}),
          },
          body: JSON.stringify(props),
          signal: AbortSignal.timeout(options.timeoutMs ?? 60_000),
        });
      } catch (cause) {
        const error = ApiError.unavailable('RENDER_UNAVAILABLE', 'Il servizio che compone le card non risponde. Riprova tra poco.');
        error.cause = cause;
        throw error;
      }
      const type = response.headers.get('content-type') ?? '';
      if (!response.ok || !type.startsWith('image/png')) {
        const error = new ApiError(502, 'RENDER_FAILED', 'Non sono riuscito a comporre la card. Riprova.');
        error.cause = `be-render risponde ${response.status}: ${(await response.text().catch(() => '')).slice(0, 500)}`;
        throw error;
      }
      return new Uint8Array(await response.arrayBuffer());
    },

    async health() {
      try {
        const response = await fetch(url('health'), { signal: AbortSignal.timeout(5000) });
        return response.ok;
      } catch {
        return false;
      }
    },
  };
}
