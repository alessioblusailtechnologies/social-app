import type { FastifyBaseLogger } from 'fastify';

import type { AiMeta, AiUsage } from '../ai/engine';
import { ApiError } from '../contract/errors';
import type { MediaBytes } from './images';

/**
 * La musica dei video, da ElevenLabs Music: tracce strumentali costruite a sezioni, così la velocità e l'arco (intro,
 * crescendo, chiusura) li decide il piano e non il caso. Il piano lo scrive l'AI dal «come suona» del brand; qui si
 * compone e basta.
 */

export interface TrackSection {
  name: string;
  /** In inglese, in termini musicali: strumenti, dinamica, carattere. Niente nomi di artisti o di brani. */
  styles: string[];
  seconds: number;
}

export interface TrackPlan {
  /** In inglese: genere, velocità, strumenti, atmosfera. Valgono per tutta la traccia. */
  styles: string[];
  /** Quello che la traccia non deve avere, in inglese: la voce resta fuori comunque. */
  avoid: string[];
  sections: TrackSection[];
}

export interface MusicGenerator {
  /** Falso senza chiave: i video si montano senza musica. */
  readonly available: boolean;
  compose(plan: TrackPlan, meta: AiMeta): Promise<MediaBytes>;
}

export const unavailableMusic: MusicGenerator = {
  available: false,
  compose: () => Promise.reject(ApiError.unavailable('MUSIC_UNAVAILABLE', 'La musica non è configurata su questo server.')),
};

/** A consumo, del 24/09/2026: uguale per tutti i modelli. */
const PRICE_PER_MINUTE = 0.15;

export interface ElevenLabsMusicOptions {
  apiKey: string;
  model: string;
  log: FastifyBaseLogger;
  recordUsage: (usage: AiUsage) => Promise<void>;
  timeoutMs?: number;
}

export function elevenLabsMusic(options: ElevenLabsMusicOptions): MusicGenerator {
  const endpoint = 'https://api.elevenlabs.io/v1/music?output_format=mp3_44100_192';

  return {
    available: true,

    async compose(plan, meta) {
      const started = Date.now();
      const seconds = plan.sections.reduce((total, section) => total + section.seconds, 0);
      let error: string | null = null;
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'xi-api-key': options.apiKey, 'content-type': 'application/json' },
          body: JSON.stringify({
            model_id: options.model,
            force_instrumental: true,
            composition_plan: {
              positive_global_styles: plan.styles,
              negative_global_styles: [...plan.avoid, 'vocals', 'singing', 'spoken words'],
              sections: plan.sections.map((section) => ({
                section_name: section.name,
                positive_local_styles: section.styles,
                negative_local_styles: [],
                duration_ms: Math.round(section.seconds * 1000),
                lines: [],
              })),
            },
          }),
          signal: AbortSignal.timeout(options.timeoutMs ?? 180_000),
        });
        if (!response.ok) {
          const detail = await response.text().catch(() => '');
          throw new Error(`ElevenLabs ${response.status}: ${detail.slice(0, 300)}`);
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength < 1000) throw new Error('traccia vuota');
        return { bytes, mimeType: 'audio/mpeg' };
      } catch (caught) {
        error = caught instanceof Error ? caught.message : String(caught);
        options.log.error({ err: caught }, 'traccia non composta');
        throw new ApiError(502, 'MUSIC_FAILED', 'Non sono riuscito a comporre la musica. Riprova.');
      } finally {
        void options
          .recordUsage({
            task: 'music',
            accountId: meta.accountId,
            brandId: meta.brandId ?? null,
            model: options.model,
            outcome: error ? 'error' : 'ok',
            error,
            durationMs: Date.now() - started,
            turns: 0,
            costUsd: error ? 0 : (seconds / 60) * PRICE_PER_MINUTE,
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          })
          .catch((failure: unknown) => options.log.warn({ err: failure }, 'consumi della musica non registrati'));
      }
    },
  };
}
