import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';

import { ApiError } from '../contract/errors';
import type { MediaBytes } from '../media/images';
import type { AiMeta, AiUsage, Effort } from './engine';

/**
 * Il direttore artistico della linea grafica: un Claude che vede le immagini (i riferimenti, o le card di prima in
 * una correzione) e risponde con la linea in JSON. È una chiamata sola dell'API di Anthropic, non una sessione
 * dell'Agent SDK: non servono strumenti, servono gli occhi e il giudizio. Si usa di rado (la linea si fa una volta
 * per brand, più qualche correzione), quindi il modello più capace costa poco in assoluto.
 */

export interface DesignRequest<S extends z.ZodType> {
  system: string;
  /** Le immagini vanno prima del testo, ognuna con la sua didascalia. */
  images: { label: string; image: MediaBytes }[];
  prompt: string;
  schema: S;
  meta: AiMeta;
  /** A mano a mano che la risposta arriva: il testo scritto finora (JSON a metà), per mostrare i passi. */
  onProgress?: (written: string) => void;
}

export interface ArtDirector {
  readonly available: boolean;
  run<S extends z.ZodType>(request: DesignRequest<S>): Promise<z.output<S>>;
}

export const unavailableDirector: ArtDirector = {
  available: false,
  run: () => Promise.reject(ApiError.unavailable('AI_UNAVAILABLE', 'L’AI non è configurata su questo server.')),
};

/** Listino per milione di token, in $. Un modello fuori elenco conta come Opus. */
const PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
};

type ImageMime = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
const IMAGE_MIMES: ImageMime[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export interface AnthropicDirectorOptions {
  apiKey: string;
  model: string;
  effort: Effort;
  timeoutMs: number;
  log: FastifyBaseLogger;
  recordUsage: (usage: AiUsage) => Promise<void>;
}

export function anthropicDirector(options: AnthropicDirectorOptions): ArtDirector {
  const client = new Anthropic({ apiKey: options.apiKey, timeout: options.timeoutMs, maxRetries: 1 });
  const price = PRICES[options.model] ?? PRICES['claude-opus-5'];

  return {
    available: true,

    async run({ system, images, prompt, schema, meta, onProgress }) {
      const started = Date.now();
      let usage: Anthropic.Beta.BetaUsage | null = null;
      let problem: string | null = null;
      let output: z.output<typeof schema> | undefined;

      const content: Anthropic.Beta.BetaContentBlockParam[] = [];
      for (const { label, image } of images) {
        const mediaType = IMAGE_MIMES.find((mime) => mime === image.mimeType);
        if (!mediaType) continue;
        content.push({ type: 'text', text: label });
        content.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: Buffer.from(image.bytes).toString('base64') } });
      }
      content.push({ type: 'text', text: prompt });

      try {
        // In streaming: i template sono HTML e CSS, la risposta può essere lunga.
        const stream = client.beta.messages.stream({
          model: options.model,
          max_tokens: 64000,
          thinking: { type: 'adaptive' },
          output_config: { effort: options.effort, format: zodOutputFormat(schema) },
          // Se il modello rifiuta, l'API rifà la stessa richiesta su un modello di riserva.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system,
          messages: [{ role: 'user', content }],
        });
        if (onProgress) stream.on('text', (_delta, written) => onProgress(written));
        const response = await stream.finalMessage();
        usage = response.usage;
        if (response.stop_reason === 'refusal') throw new Error(`rifiuto: ${response.stop_details?.category ?? 'senza categoria'}`);
        if (response.stop_reason === 'max_tokens') throw new Error('risposta tagliata al tetto dei token');
        if (response.parsed_output == null) throw new Error('risposta fuori schema');
        output = response.parsed_output as z.output<typeof schema>;
        return output;
      } catch (error) {
        problem = error instanceof Error ? error.message : String(error);
        options.log.error({ problem, model: options.model }, 'direzione artistica non riuscita');
        if (error instanceof Anthropic.RateLimitError) {
          throw new ApiError(503, 'AI_BUSY', 'Il servizio è molto richiesto in questo momento. Riprova tra poco.');
        }
        throw new ApiError(502, 'AI_FAILED', 'Non sono riuscito a preparare la linea. Riprova.');
      } finally {
        const input = usage?.input_tokens ?? 0;
        const outputTokens = usage?.output_tokens ?? 0;
        const cacheRead = usage?.cache_read_input_tokens ?? 0;
        const cacheWrite = usage?.cache_creation_input_tokens ?? 0;
        const cost = (input * price.input + outputTokens * price.output + cacheRead * price.cacheRead + cacheWrite * price.cacheWrite) / 1_000_000;
        void options
          .recordUsage({
            task: 'visual-style',
            accountId: meta.accountId,
            brandId: meta.brandId ?? null,
            model: options.model,
            outcome: output === undefined ? 'error' : 'ok',
            error: problem,
            durationMs: Date.now() - started,
            turns: 1,
            costUsd: Math.round(cost * 1e6) / 1e6,
            inputTokens: input,
            outputTokens,
            cacheReadTokens: cacheRead,
            cacheWriteTokens: cacheWrite,
          })
          .catch((error: unknown) => options.log.warn({ err: error }, 'consumi della direzione artistica non registrati'));
      }
    },
  };
}
