import type { FastifyBaseLogger } from 'fastify';

import type { AiMeta, AiTask, AiUsage } from '../ai/engine';
import { ApiError } from '../contract/errors';
import type { MediaBytes } from './images';

/**
 * Le generazioni che guardano immagini, con Gemini: il modello dei testi (DeepSeek o Claude dall'Agent SDK) non le
 * vede. Risponde in JSON; la forma la dice il prompt e la ricontrolla chi chiama.
 */

export interface VisionRequest {
  task: AiTask;
  prompt: string;
  images: MediaBytes[];
  meta: AiMeta;
}

export interface VisionService {
  /** Falso senza chiave: chi la usa lo dice subito. */
  readonly available: boolean;
  json(request: VisionRequest): Promise<unknown>;
}

export const unavailableVision: VisionService = {
  available: false,
  json: () =>
    Promise.reject(ApiError.unavailable('VISION_UNAVAILABLE', 'L’analisi delle immagini non è configurata su questo server.')),
};

/** Listino indicativo per milione di token, in $. Un modello fuori elenco conta come il Flash. */
const PRICES: Record<string, { input: number; output: number }> = {
  'gemini-3.5-flash': { input: 0.3, output: 2.5 },
  'gemini-flash-latest': { input: 0.3, output: 2.5 },
};

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
  error?: { message?: string };
}

export interface GeminiVisionOptions {
  apiKey: string;
  model: string;
  log: FastifyBaseLogger;
  recordUsage: (usage: AiUsage) => Promise<void>;
  timeoutMs?: number;
}

export function geminiVision(options: GeminiVisionOptions): VisionService {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(options.model)}:generateContent`;
  const price = PRICES[options.model] ?? PRICES['gemini-3.5-flash'];

  return {
    available: true,

    async json({ task, prompt, images, meta }) {
      const started = Date.now();
      let body: GeminiResponse | null = null;
      let result: unknown;
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
                  ...images.map((image) => ({
                    inlineData: { mimeType: image.mimeType, data: Buffer.from(image.bytes).toString('base64') },
                  })),
                  { text: prompt },
                ],
              },
            ],
            generationConfig: { responseMimeType: 'application/json' },
          }),
          signal: AbortSignal.timeout(options.timeoutMs ?? 90_000),
        });
        body = (await response.json().catch(() => null)) as GeminiResponse | null;
        if (!response.ok) throw new Error(`Gemini risponde ${response.status}: ${body?.error?.message ?? 'senza dettagli'}`);
        const text = body?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
        if (!text.trim()) {
          const reason = body?.promptFeedback?.blockReason ?? body?.candidates?.[0]?.finishReason ?? 'motivo non indicato';
          throw new Error(`risposta vuota (${reason})`);
        }
        result = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
        return result;
      } catch (error) {
        problem = error instanceof Error ? error.message : String(error);
        options.log.error({ problem, model: options.model, task }, 'analisi delle immagini non riuscita');
        throw new ApiError(502, 'VISION_FAILED', 'Non sono riuscito a guardare le immagini. Riprova.');
      } finally {
        const input = body?.usageMetadata?.promptTokenCount ?? 0;
        const output = (body?.usageMetadata?.candidatesTokenCount ?? 0) + (body?.usageMetadata?.thoughtsTokenCount ?? 0);
        void options
          .recordUsage({
            task,
            accountId: meta.accountId,
            brandId: meta.brandId ?? null,
            model: options.model,
            outcome: result === undefined ? 'error' : 'ok',
            error: problem,
            durationMs: Date.now() - started,
            turns: 1,
            costUsd: Math.round(((input * price.input + output * price.output) / 1_000_000) * 1_000_000) / 1_000_000,
            inputTokens: input,
            outputTokens: output,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          })
          .catch((error: unknown) => options.log.warn({ err: error }, 'consumi dell’analisi non registrati'));
      }
    },
  };
}
