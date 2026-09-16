import type { FastifyBaseLogger } from 'fastify';

import type { AiMeta, AiUsage } from '../ai/engine';
import { ApiError } from '../contract/errors';
import { assertPublicUrl } from '../lib/public-url';
import type { MediaBytes } from './images';

/**
 * Lo scontorno dei soggetti con BiRefNet su fal (licenza MIT). Riceve l'indirizzo firmato della foto e
 * restituisce un PNG trasparente, che i template appoggiano sul fondo del brand.
 */

export interface CutoutRequest {
  /** Un indirizzo che fal può aprire: quello firmato dello Storage, o un data URI. */
  imageUrl: string;
  meta: AiMeta;
}

export interface CutoutService {
  /** Falso senza chiave: la creazione lo dice subito, senza mettere niente in coda. */
  readonly available: boolean;
  cut(request: CutoutRequest): Promise<MediaBytes>;
}

export const unavailableCutout: CutoutService = {
  available: false,
  cut: () =>
    Promise.reject(
      ApiError.unavailable(
        'CUTOUT_UNAVAILABLE',
        'Lo scontorno non è configurato su questo server: scegli un layout senza soggetto scontornato.',
      ),
    ),
};

const MODEL = 'fal-ai/birefnet/v2';
const ENDPOINT = `https://fal.run/${MODEL}`;

/** fal fa pagare il tempo di calcolo, 0,0008 $ al secondo: la durata della chiamata è un tetto. */
const PRICE_PER_SECOND = 0.0008;

interface FalResponse {
  image?: { url?: string; content_type?: string };
  detail?: unknown;
}

export interface FalCutoutOptions {
  apiKey: string;
  log: FastifyBaseLogger;
  recordUsage: (usage: AiUsage) => Promise<void>;
  timeoutMs?: number;
}

export function falCutout(options: FalCutoutOptions): CutoutService {
  return {
    available: true,

    async cut({ imageUrl, meta }) {
      const started = Date.now();
      let result: MediaBytes | null = null;
      let problem: string | null = null;
      try {
        const response = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { authorization: `Key ${options.apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            image_url: imageUrl,
            model: 'General Use (Heavy)',
            operating_resolution: '2048x2048',
            output_format: 'png',
            refine_foreground: true,
          }),
          signal: AbortSignal.timeout(options.timeoutMs ?? 120_000),
        });
        const body = (await response.json().catch(() => null)) as FalResponse | null;
        if (!response.ok || !body?.image?.url) {
          throw new Error(`fal risponde ${response.status}: ${JSON.stringify(body?.detail ?? body).slice(0, 300)}`);
        }
        // L'indirizzo del risultato arriva da fuori: si apre solo se è pubblico, come ogni altro.
        const url = await assertPublicUrl(body.image.url);
        const file = await fetch(url, { signal: AbortSignal.timeout(60_000) });
        if (!file.ok) throw new Error(`scontorno non scaricato: ${file.status}`);
        result = { bytes: new Uint8Array(await file.arrayBuffer()), mimeType: 'image/png' };
        return result;
      } catch (error) {
        problem = error instanceof Error ? error.message : String(error);
        options.log.error({ problem }, 'scontorno non riuscito');
        throw new ApiError(502, 'CUTOUT_FAILED', 'Non sono riuscito a scontornare il soggetto. Riprova o scegli un layout senza scontorno.');
      } finally {
        const durationMs = Date.now() - started;
        void options
          .recordUsage({
            task: 'cutout',
            accountId: meta.accountId,
            brandId: meta.brandId ?? null,
            model: MODEL,
            outcome: result ? 'ok' : 'error',
            error: problem,
            durationMs,
            turns: 0,
            costUsd: result ? Math.round((durationMs / 1000) * PRICE_PER_SECOND * 1e6) / 1e6 : 0,
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          })
          .catch((error: unknown) => options.log.warn({ err: error }, 'consumi dello scontorno non registrati'));
      }
    },
  };
}
