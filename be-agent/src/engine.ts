import {
  query,
  type HookCallback,
  type McpServerConfig,
  type Options,
  type SDKMessage,
  type SDKResultMessage,
} from '@anthropic-ai/claude-agent-sdk';
import type { FastifyBaseLogger } from 'fastify';
import { writeFile } from 'node:fs/promises';
import { basename, delimiter, join } from 'node:path';

import type pg from 'pg';
import { z } from 'zod';

import type { Brand } from '@/domain/brand';

import type { AiEngine, AiRequest, AiUsage, Effort, ToolEvent } from '../../be-node/src/ai/engine';
import { ApiError } from '../../be-node/src/contract/errors';
import { findBrand } from '../../be-node/src/data/brands';
import { assertPublicUrl } from '../../be-node/src/lib/public-url';
import type { ImageGenerator } from '../../be-node/src/media/images';
import type { CardRenderer } from '../../be-node/src/media/renderer';
import type { MediaStorage } from '../../be-node/src/media/storage';
import { guardHiggsfield, higgsfieldDenied, higgsfieldServer, mirrorMedia, waitBeforeLeaving } from './higgsfield';
import type { HiggsfieldAuth } from './higgsfield-auth';
import { visualTools } from './tools';
import { deliverBeforeLeaving, ffmpegDir, prepareStudio, videoTools } from './video';
import { prepareWorkspace } from './workspace';

/**
 * Il motore agentico: Claude Code com'è nato.
 *
 * La differenza con `be-node` non è il modello, è cosa gli si lascia fare. Lì la sessione ha il
 * prompt di sistema sostituito, nessuno strumento tranne il web, una cartella vuota e quattro giri
 * per consegnare. Qui c'è il prompt di sistema di Claude Code, tutti i suoi strumenti, e come
 * cartella di lavoro il profilo del brand: l'agente lo legge, guarda i visivi dell'onboarding,
 * prova, si rilegge, e consegna quando è soddisfatto.
 *
 * Resta l'output strutturato, perché l'app si aspetta quella forma: ma è una funzione dell'SDK,
 * non una gabbia messa da noi.
 */

export interface AgentEngineOptions {
  model: string;
  effort: Effort;
  maxTurns: number;
  timeoutMs: number;
  maxBudgetUsd: number;
  /** Dove stanno le cartelle di lavoro, una per brand. */
  workspacesRoot: string;
  pool: pg.Pool;
  storage: MediaStorage;
  /** Servono agli strumenti del visivo: le chiavi restano di qua, l'agente chiede. */
  images: ImageGenerator;
  renderer: CardRenderer;
  /** Higgsfield come server MCP remoto: nullo senza sessione, e allora l'agente non lo vede. */
  higgsfield: { url: string; auth: HiggsfieldAuth; imageModel: string } | null;
  log: FastifyBaseLogger;
  recordUsage: (usage: AiUsage) => Promise<void>;
}

/**
 * Le variabili che il processo dell'agente riceve. Non `process.env` intero: con Bash e i permessi
 * bypassati, la chiave di servizio di Supabase e l'indirizzo del database nel suo ambiente sono
 * potere che non gli serve. Quello che gli serve davvero (foto, render) passa dagli strumenti.
 */
const PASSED_ENV = ['PATH', 'HOME', 'USERPROFILE', 'TMP', 'TEMP', 'SystemRoot', 'ComSpec', 'APPDATA', 'LOCALAPPDATA', 'TZ', 'ANTHROPIC_API_KEY'];

function agentEnv(extraPath?: string | null): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of PASSED_ENV) {
    const value = process.env[name];
    if (value !== undefined) env[name] = value;
  }
  // Chi monta trova ffmpeg nel `PATH` come lo troverebbe sulla sua macchina, e lo chiama così.
  if (extraPath) env.PATH = `${extraPath}${delimiter}${env.PATH ?? ''}`;
  env.CLAUDE_AGENT_SDK_CLIENT_APP = 'presenza-agent/0.1.0';
  return env;
}

export class AgentEngine implements AiEngine {
  constructor(private readonly options: AgentEngineOptions) {}

  async run<S extends z.ZodType>(request: AiRequest<S>): Promise<z.output<S>> {
    const started = Date.now();
    const abort = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      abort.abort();
    }, this.options.timeoutMs);

    // Senza brand non c'è profilo da leggere: succede nell'onboarding, prima che il brand esista.
    const brand = request.brandId ? await findBrand(this.options.pool, request.brandId) : null;
    const workspace = await this.workspaceFor(request, brand);

    // Higgsfield solo dove i file hanno una casa: senza brand non c'è libreria in cui copiarli, e
    // un indirizzo che scade tra un'ora non è una consegna. Il token si conia adesso, perché quello
    // di ieri non vale più; se la loro sessione è finita si genera senza, non si ferma niente.
    let higgsfield: { url: string; token: string } | null = null;
    if (brand && this.options.higgsfield && request.generate !== false) {
      try {
        higgsfield = { url: this.options.higgsfield.url, token: await this.options.higgsfield.auth.token() };
      } catch (error) {
        this.options.log.warn({ err: error }, 'higgsfield senza sessione: si genera senza');
      }
    }

    // Gli strumenti del visivo solo a chi disegna un visivo: altrove sarebbero rumore nel prompt.
    // Le foto le fa `genera_foto` soltanto quando Higgsfield non c'è: quando c'è, le immagini si
    // chiedono a lui come le clip, e non restano due strade per la stessa cosa.
    const photos = new Map<string, string>();
    const drawing = request.task === 'visual-design' && brand !== null;
    const mcp = drawing
      ? visualTools({
          accountId: request.accountId,
          brand: brand!,
          images: this.options.images,
          renderer: this.options.renderer,
          storage: this.options.storage,
          log: this.options.log,
          photos,
          withPhotos: higgsfield === null,
        })
      : null;

    // Chi gira un video monta nella cartella di lavoro: ffmpeg nel PATH, e due strumenti nostri —
    // guardare quello che ha montato, e consegnarlo nella libreria.
    const filming = request.task === 'video' && brand !== null;
    const delivered = new Map<string, string>();
    const studio = request.studio ? join(workspace.dir, request.studio) : workspace.dir;

    const mcpServers: Record<string, McpServerConfig> = {};
    if (mcp) mcpServers.visivo = mcp;
    if (higgsfield) mcpServers.higgsfield = higgsfieldServer(higgsfield);
    if (filming && brand) {
      mcpServers.montaggio = videoTools({
        accountId: request.accountId,
        brandId: brand.id,
        dir: workspace.dir,
        storage: this.options.storage,
        log: this.options.log,
        delivered,
      });
    }

    // L'agente può aprire pagine: valgono gli stessi indirizzi ammessi alle rotte, niente rete interna.
    const guardUrls: HookCallback = async (input) => {
      if (input.hook_event_name !== 'PreToolUse' || input.tool_name !== 'WebFetch') return {};
      const url = (input.tool_input as { url?: unknown } | undefined)?.url;
      try {
        if (typeof url !== 'string') throw new Error('indirizzo mancante');
        await assertPublicUrl(url);
        return {};
      } catch {
        return {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: 'Si possono aprire solo pagine web pubbliche.',
          },
        };
      }
    };

    // Coi tool di Higgsfield servono due guardie in più: una prima, sul confine tra generare e
    // agire sul mondo; una dopo, che porta i file nella libreria del brand prima che scadano.
    const preTool: HookCallback[] = [guardUrls];
    const postTool: HookCallback[] = [];
    // I file che Higgsfield ha prodotto, copiati nella libreria: chi genera un fotogramma o una clip non esce senza.
    const generated = new Map<string, string>();
    const generating = (request.task === 'video-frame' || request.task === 'video-clip') && higgsfield !== null;
    const onStop: HookCallback[] = filming
      ? [deliverBeforeLeaving({ delivered, log: this.options.log })]
      : generating
        ? [waitBeforeLeaving({ generated, log: this.options.log })]
        : [];
    if (higgsfield && brand) {
      preTool.push(guardHiggsfield(this.options.log));
      postTool.push(
        mirrorMedia({
          accountId: request.accountId,
          brandId: brand.id,
          storage: this.options.storage,
          log: this.options.log,
          saved: generated,
          ...(filming && { dir: studio }),
        }),
      );
    }

    let stderr = '';
    const options: Options = {
      cwd: workspace.dir,
      model: this.options.model,
      effort: request.effort ?? this.options.effort,
      maxBudgetUsd: this.options.maxBudgetUsd,
      // Il prompt di sistema di Claude Code, col compito in coda: gli strumenti li sa già usare,
      // quello che non sa è cosa deve scrivere.
      systemPrompt: { type: 'preset', preset: 'claude_code', append: request.system },
      // Nessun `tools`/`allowedTools`: restano tutti quelli nativi.
      // Legge il CLAUDE.md della cartella di lavoro, non quelli dell'utente o della macchina.
      settingSources: ['project'],
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      persistSession: false,
      maxTurns: request.maxTurns ?? this.options.maxTurns,
      outputFormat: {
        type: 'json_schema',
        schema: z.toJSONSchema(request.schema, { target: 'draft-7' }) as Record<string, unknown>,
      },
      abortController: abort,
      hooks: {
        PreToolUse: [{ hooks: preTool }],
        ...(postTool.length > 0 && { PostToolUse: [{ hooks: postTool }] }),
        ...(onStop.length > 0 && { Stop: [{ hooks: onStop }] }),
      },
      ...(Object.keys(mcpServers).length > 0 && { mcpServers }),
      // Tolti dal contesto, non solo negati: quello che non genera, l'agente non lo vede.
      ...(higgsfield && { disallowedTools: higgsfieldDenied }),
      env: agentEnv(filming ? ffmpegDir() : null),
      stderr: (data) => {
        stderr = `${stderr}${data}`.slice(-2000);
      },
    };

    // Chi gira riceve anche il progetto di montaggio, dentro la stessa cartella.
    let summary = workspace.summary;
    if (higgsfield && this.options.higgsfield) {
      summary = `${summary}\n\nLe immagini e i video li generi con Higgsfield. Per le foto usa ${this.options.higgsfield.imageModel}: è quello scelto per le foto dei brand, e cambiarlo si vede.`;
    }
    if (filming) {
      try {
        summary = `${summary}\n- ${await prepareStudio(studio, request.studio ? `${request.studio}/` : '')}`;
        // Il materiale caricato da chi pubblica, già al suo posto: col percorso dello Storage non ci si monta niente.
        for (const file of request.media ?? []) {
          try {
            const stored = await this.options.storage.download(file.path);
            await writeFile(join(studio, 'media', basename(file.name)), stored.bytes);
          } catch (error) {
            this.options.log.warn({ err: error, path: file.path }, 'materiale non scaricato nel montaggio');
          }
        }
      } catch (error) {
        this.options.log.warn({ err: error }, 'progetto di montaggio non preparato');
      }
    }

    const prompt = summary ? `${summary}\n\n---\n\n${request.prompt}` : request.prompt;

    let result: SDKResultMessage | undefined;
    let failure: unknown;
    try {
      for await (const message of query({ prompt, options })) {
        if (message.type === 'result') result = message;
        else if (request.onTool) toolEvents(message).forEach(request.onTool);
      }
    } catch (error) {
      failure = error;
    } finally {
      clearTimeout(timer);
    }

    let output: z.output<S> | undefined;
    let problem: string | null = null;
    if (result?.subtype === 'success' && result.structured_output !== undefined) {
      const parsed = request.schema.safeParse(result.structured_output);
      if (parsed.success) output = parsed.data;
      else problem = `output fuori schema: ${parsed.error.message}`;
    } else if (timedOut) {
      problem = `nessun risultato entro ${this.options.timeoutMs} ms`;
    } else if (result && result.subtype !== 'success') {
      problem = `${result.subtype}: ${result.errors.join('; ')}`;
    } else {
      problem = failure instanceof Error ? failure.message : result ? 'risultato senza output strutturato' : 'sessione chiusa senza risultato';
    }

    const usage: AiUsage = {
      task: request.task,
      accountId: request.accountId,
      brandId: request.brandId ?? null,
      model: this.options.model,
      outcome: output === undefined ? 'error' : 'ok',
      error: problem,
      durationMs: Date.now() - started,
      turns: result?.num_turns ?? 0,
      costUsd: result?.total_cost_usd ?? 0,
      ...sessionTokens(result),
    };
    void this.options
      .recordUsage(usage)
      .catch((error: unknown) => this.options.log.warn({ err: error }, 'consumi AI non registrati'));

    this.options.log.info(
      { task: request.task, turns: usage.turns, costUsd: usage.costUsd, seconds: Math.round(usage.durationMs / 1000) },
      output === undefined ? 'generazione non riuscita' : 'generazione conclusa',
    );

    if (output !== undefined) return output;

    this.options.log.error({ task: request.task, problem, stderr: stderr || undefined }, 'generazione AI non riuscita');
    if (timedOut) throw new ApiError(504, 'AI_TIMEOUT', 'La generazione ci sta mettendo troppo. Riprova tra poco.');
    throw new ApiError(502, 'AI_FAILED', 'Non sono riuscito a completare la generazione. Riprova.');
  }

  /**
   * La cartella del brand, rifatta quando il profilo cambia. Nei compiti dell'onboarding il brand
   * non c'è ancora: si lavora in una cartella vuota, come in `be-node`.
   */
  private async workspaceFor(request: AiRequest<z.ZodType>, brand: Brand | null): Promise<{ dir: string; summary: string }> {
    const root = this.options.workspacesRoot;
    if (!brand) return { dir: await emptyDir(root), summary: '' };
    try {
      return await prepareWorkspace(root, brand, this.options.storage);
    } catch (error) {
      this.options.log.warn({ err: error, brandId: request.brandId }, 'cartella del brand non preparata: si lavora senza');
      return { dir: await emptyDir(root), summary: '' };
    }
  }
}

async function emptyDir(root: string): Promise<string> {
  const { mkdir } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const dir = join(root, '_vuota');
  await mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Gli strumenti aperti e chiusi nella sessione principale: qui sono tutti quelli di Claude Code,
 * non solo il web, perché è proprio il lavoro dell'agente che l'utente deve vedere scorrere.
 * Lo strumento dell'output strutturato non è un passo e resta fuori.
 */
export function toolEvents(message: SDKMessage): ToolEvent[] {
  if (message.type === 'assistant' && message.parent_tool_use_id === null) {
    return message.message.content.flatMap((block): ToolEvent[] =>
      block.type === 'tool_use'
        ? [{ type: 'start', id: block.id, tool: block.name, input: (block.input ?? {}) as Record<string, unknown> }]
        : [],
    );
  }
  if (message.type === 'user' && message.parent_tool_use_id === null && Array.isArray(message.message.content)) {
    return message.message.content.flatMap((block): ToolEvent[] =>
      block.type === 'tool_result' ? [{ type: 'end', id: block.tool_use_id, ok: !block.is_error }] : [],
    );
  }
  return [];
}

function sessionTokens(
  result: SDKResultMessage | undefined,
): Pick<AiUsage, 'inputTokens' | 'outputTokens' | 'cacheReadTokens' | 'cacheWriteTokens'> {
  const tokens = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  for (const model of Object.values(result?.modelUsage ?? {})) {
    tokens.inputTokens += model.inputTokens;
    tokens.outputTokens += model.outputTokens;
    tokens.cacheReadTokens += model.cacheReadInputTokens;
    tokens.cacheWriteTokens += model.cacheCreationInputTokens;
  }
  return tokens;
}
