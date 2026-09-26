import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';

import type { MaterialCatalog } from '@shared/domain/idea';

import type { AiMeta, AiUsage } from '../ai/engine';
import { ApiError } from '../contract/errors';

/**
 * Cosa c'è nel materiale di chi pubblica, con Gemini: guarda il video nativamente, immagine e audio insieme, e ne
 * restituisce i momenti coi loro tempi. È il lavoro degli occhi e delle orecchie; scegliere i pezzi e scrivere la
 * storia resta a chi fa la regia.
 *
 * Le foto viaggiano dentro la richiesta. I video, che pesano, passano dalla Files API: si caricano, si aspetta che
 * Gemini li abbia elaborati, si guardano, e si cancellano.
 */

export interface FootageFile {
  bytes: Uint8Array;
  mimeType: string;
  name: string;
  kind: 'video' | 'image';
}

export interface FootageAnalyzer {
  /** Falso senza chiave: la creazione dal materiale lo dice subito. */
  readonly available: boolean;
  catalog(file: FootageFile, meta: AiMeta): Promise<MaterialCatalog>;
}

export const unavailableFootage: FootageAnalyzer = {
  available: false,
  catalog: () =>
    Promise.reject(ApiError.unavailable('FOOTAGE_UNAVAILABLE', 'L’analisi di foto e video non è configurata su questo server.')),
};

/** Listino indicativo per milione di token, in $. */
const PRICE = { input: 0.3, output: 2.5 };

const catalogSchema = z.object({
  summary: z.string().catch(''),
  seconds: z.number().nullable().catch(null),
  shots: z
    .array(
      z.object({
        start: z.number(),
        end: z.number(),
        what: z.string(),
        usable: z.boolean().catch(true),
        faces: z.boolean().catch(false),
      }),
    )
    .catch([]),
  audio: z.string().catch(''),
});

const VIDEO_PROMPT = [
  'Questo è un video girato da chi pubblica per il suo brand, da cui si monterà un reel.',
  'Descrivi i momenti del video in ordine, ognuno con inizio e fine in secondi: cosa si vede (azione, soggetto, inquadratura, luce, movimento di camera), se è usabile per un reel (non mosso, non sfocato, non buio, non tagliato male) e se si riconosce il volto di qualcuno.',
  'Poi dì cosa si sente: voce (e cosa dice, in breve), rumori, musica; vuoto se niente.',
  'Rispondi solo con un oggetto JSON: { "summary": "il video in una frase", "seconds": durata, "shots": [{ "start": 0, "end": 4.5, "what": "…", "usable": true, "faces": false }], "audio": "…" }. In italiano.',
].join('\n');

const IMAGE_PROMPT = [
  'Questa è una foto di chi pubblica per il suo brand, da usare in un reel o in un carosello.',
  'Descrivi cosa si vede (soggetto, inquadratura, luce, colori) e se si riconosce il volto di qualcuno, in una o due frasi.',
  'Rispondi solo con un oggetto JSON: { "summary": "…", "seconds": null, "shots": [], "audio": "", "faces": false }. In italiano.',
].join('\n');

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
  error?: { message?: string };
}

export interface GeminiFootageOptions {
  apiKey: string;
  model: string;
  log: FastifyBaseLogger;
  recordUsage: (usage: AiUsage) => Promise<void>;
  timeoutMs?: number;
}

const API = 'https://generativelanguage.googleapis.com';

export function geminiFootage(options: GeminiFootageOptions): FootageAnalyzer {
  const headers = { 'x-goog-api-key': options.apiKey };
  const timeout = () => AbortSignal.timeout(options.timeoutMs ?? 300_000);

  /** Il video nella Files API: l'indirizzo con cui lo si cita, e il nome con cui lo si cancella. */
  async function upload(file: FootageFile): Promise<{ uri: string; name: string }> {
    const start = await fetch(`${API}/upload/v1beta/files`, {
      method: 'POST',
      headers: {
        ...headers,
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(file.bytes.byteLength),
        'X-Goog-Upload-Header-Content-Type': file.mimeType,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ file: { display_name: file.name.slice(0, 120) } }),
      signal: timeout(),
    });
    const target = start.headers.get('x-goog-upload-url');
    if (!start.ok || !target) throw new Error(`caricamento non avviato: ${start.status}`);

    const sent = await fetch(target, {
      method: 'POST',
      headers: { 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' },
      body: Buffer.from(file.bytes),
      signal: timeout(),
    });
    const body = (await sent.json().catch(() => null)) as { file?: { uri?: string; name?: string; state?: string } } | null;
    if (!sent.ok || !body?.file?.uri || !body.file.name) throw new Error(`caricamento non riuscito: ${sent.status}`);

    // Il video va elaborato prima di poterlo guardare: si aspetta che sia attivo.
    let state = body.file.state;
    for (let attempt = 0; state === 'PROCESSING' && attempt < 60; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const check = await fetch(`${API}/v1beta/${body.file.name}`, { headers, signal: timeout() });
      state = ((await check.json().catch(() => null)) as { state?: string } | null)?.state;
    }
    if (state !== 'ACTIVE') throw new Error(`il video non è pronto (${state ?? 'stato sconosciuto'})`);
    return { uri: body.file.uri, name: body.file.name };
  }

  return {
    available: true,

    async catalog(file, meta) {
      const started = Date.now();
      let response: GeminiResponse | null = null;
      let result: MaterialCatalog | undefined;
      let problem: string | null = null;
      let uploaded: { uri: string; name: string } | null = null;
      try {
        const media =
          file.kind === 'video'
            ? { fileData: { mimeType: file.mimeType, fileUri: (uploaded = await upload(file)).uri } }
            : { inlineData: { mimeType: file.mimeType, data: Buffer.from(file.bytes).toString('base64') } };
        const answer = await fetch(`${API}/v1beta/models/${encodeURIComponent(options.model)}:generateContent`, {
          method: 'POST',
          headers: { ...headers, 'content-type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [media, { text: file.kind === 'video' ? VIDEO_PROMPT : IMAGE_PROMPT }] }],
            generationConfig: { responseMimeType: 'application/json' },
          }),
          signal: timeout(),
        });
        response = (await answer.json().catch(() => null)) as GeminiResponse | null;
        if (!answer.ok) throw new Error(`Gemini risponde ${answer.status}: ${response?.error?.message ?? 'senza dettagli'}`);
        const text = response?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
        if (!text.trim()) throw new Error(`risposta vuota (${response?.candidates?.[0]?.finishReason ?? 'motivo non indicato'})`);
        const parsed = catalogSchema.parse(JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')));
        result = {
          summary: parsed.summary.trim(),
          seconds: file.kind === 'video' ? parsed.seconds : null,
          shots:
            file.kind === 'video'
              ? parsed.shots
                  .filter((shot) => shot.end > shot.start)
                  .map((shot) => ({ ...shot, what: shot.what.trim() }))
                  .slice(0, 40)
              : [],
          audio: file.kind === 'video' ? parsed.audio.trim() : '',
        };
        return result;
      } catch (error) {
        problem = error instanceof Error ? error.message : String(error);
        options.log.error({ problem, file: file.name }, 'materiale non guardato');
        throw new ApiError(502, 'FOOTAGE_FAILED', `Non sono riuscito a guardare «${file.name}». Riprova.`);
      } finally {
        // Il file su Gemini non serve più: scadrebbe da solo in due giorni, ma non resta in giro.
        if (uploaded) void fetch(`${API}/v1beta/${uploaded.name}`, { method: 'DELETE', headers }).catch(() => undefined);
        const input = response?.usageMetadata?.promptTokenCount ?? 0;
        const output = (response?.usageMetadata?.candidatesTokenCount ?? 0) + (response?.usageMetadata?.thoughtsTokenCount ?? 0);
        void options
          .recordUsage({
            task: 'material',
            accountId: meta.accountId,
            brandId: meta.brandId ?? null,
            model: options.model,
            outcome: result ? 'ok' : 'error',
            error: problem,
            durationMs: Date.now() - started,
            turns: 1,
            costUsd: Math.round(((input * PRICE.input + output * PRICE.output) / 1_000_000) * 1_000_000) / 1_000_000,
            inputTokens: input,
            outputTokens: output,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          })
          .catch((failure: unknown) => options.log.warn({ err: failure }, 'consumi del materiale non registrati'));
      }
    },
  };
}
