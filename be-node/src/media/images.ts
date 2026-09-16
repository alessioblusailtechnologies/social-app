import type { FastifyBaseLogger } from 'fastify';

import type { AiMeta, AiUsage } from '../ai/engine';
import { ApiError } from '../contract/errors';

/**
 * Le foto dei visivi, da Gemini (Nano Banana). Il modello riceve la descrizione, lo stile del brand e le foto
 * già fatte come riferimento, e restituisce solo l'ingrediente: i testi del post stanno nei template.
 */

export interface MediaBytes {
  bytes: Uint8Array;
  mimeType: string;
}

/** Le proporzioni in cui si chiede la foto: il template poi la ritaglia. */
export type PhotoAspect = '4:5' | '9:16' | '16:9' | '1:1';

export interface ImageRequest {
  prompt: string;
  aspectRatio: PhotoAspect;
  /** Foto del brand come riferimento di stile. */
  references: MediaBytes[];
  meta: AiMeta;
}

export interface ImageGenerator {
  /** Falso senza chiave: la creazione lo dice subito, senza mettere niente in coda. */
  readonly available: boolean;
  generate(request: ImageRequest): Promise<MediaBytes>;
}

export const unavailableImages: ImageGenerator = {
  available: false,
  generate: () =>
    Promise.reject(
      ApiError.unavailable('IMAGES_UNAVAILABLE', 'La generazione delle foto non è configurata su questo server: usa una tua foto.'),
    ),
};

/** Listino indicativo per immagine a 2K, in $, del 15/09/2026. Un modello fuori elenco conta come il Pro. */
const PRICE_PER_IMAGE: Record<string, number> = {
  'gemini-3.1-flash-image': 0.067,
  'gemini-3-pro-image': 0.134,
};

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
}

interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  error?: { message?: string };
}

/** Il modello ha risposto ma senza immagine: filtri di sicurezza o richiesta che non vuole eseguire. */
class NoImageError extends Error {}

export interface GeminiImagesOptions {
  apiKey: string;
  model: string;
  log: FastifyBaseLogger;
  /** Dove finiscono i consumi. Non blocca la risposta e un suo errore non la fa fallire. */
  recordUsage: (usage: AiUsage) => Promise<void>;
  timeoutMs?: number;
}

export function geminiImages(options: GeminiImagesOptions): ImageGenerator {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(options.model)}:generateContent`;

  return {
    available: true,

    async generate({ prompt, aspectRatio, references, meta }) {
      const started = Date.now();
      let body: GeminiResponse | null = null;
      let image: MediaBytes | null = null;
      let problem: string | null = null;
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'x-goog-api-key': options.apiKey, 'content-type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [
                  { text: prompt },
                  ...references.map((reference) => ({
                    inlineData: { mimeType: reference.mimeType, data: Buffer.from(reference.bytes).toString('base64') },
                  })),
                ],
              },
            ],
            generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio, imageSize: '2K' } },
          }),
          signal: AbortSignal.timeout(options.timeoutMs ?? 120_000),
        });
        body = (await response.json().catch(() => null)) as GeminiResponse | null;
        if (!response.ok) throw new Error(`Gemini risponde ${response.status}: ${body?.error?.message ?? 'senza dettagli'}`);

        const inline = body?.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data)?.inlineData;
        if (!inline?.data) {
          const reason = body?.promptFeedback?.blockReason ?? body?.candidates?.[0]?.finishReason ?? 'motivo non indicato';
          throw new NoImageError(`nessuna immagine nella risposta (${reason})`);
        }
        image = { bytes: Buffer.from(inline.data, 'base64'), mimeType: inline.mimeType ?? 'image/png' };
        return image;
      } catch (error) {
        problem = error instanceof Error ? error.message : String(error);
        options.log.error({ problem, model: options.model }, 'foto non generata');
        if (error instanceof NoImageError) {
          throw new ApiError(422, 'IMAGE_REFUSED', 'Il modello non ha generato questa foto: cambia la descrizione o usa una tua foto.');
        }
        throw new ApiError(502, 'IMAGE_FAILED', 'Non sono riuscito a generare la foto. Riprova.');
      } finally {
        void options
          .recordUsage({
            task: 'image',
            accountId: meta.accountId,
            brandId: meta.brandId ?? null,
            model: options.model,
            outcome: image ? 'ok' : 'error',
            error: problem,
            durationMs: Date.now() - started,
            turns: 0,
            costUsd: image ? (PRICE_PER_IMAGE[options.model] ?? PRICE_PER_IMAGE['gemini-3-pro-image']) : 0,
            inputTokens: body?.usageMetadata?.promptTokenCount ?? 0,
            outputTokens: body?.usageMetadata?.candidatesTokenCount ?? 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          })
          .catch((error: unknown) => options.log.warn({ err: error }, 'consumi della foto non registrati'));
      }
    },
  };
}
