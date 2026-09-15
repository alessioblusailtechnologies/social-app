import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { query, type HookCallback, type Options, type SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';

import { ApiError } from '../contract/errors';
import { assertPublicUrl } from '../lib/public-url';
import { costAtTariff, type ModelTarget, type TokenCount } from './providers';

/**
 * Il motore delle generazioni: per ogni richiesta una sessione dell'Agent SDK con output
 * strutturato e i soli strumenti web che il compito chiede. È un'interfaccia perché
 * servizi e test non devono sapere chi risponde: nei test c'è un motore finto.
 */

export type AiTask = 'website' | 'themes' | 'voice' | 'ideas' | 'source-ideas' | 'content' | 'rewrite';
export type WebTool = 'WebFetch' | 'WebSearch';
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface AiRequest<S extends z.ZodType> {
  task: AiTask;
  system: string;
  prompt: string;
  /** La forma della risposta: diventa lo schema dell'output strutturato e si ricontrolla all'arrivo. */
  schema: S;
  /** Senza, la sessione non ha strumenti: scrive e basta. */
  tools?: WebTool[];
  /** Senza, quella della configurazione. */
  effort?: Effort;
  /** Chi ha chiesto la generazione: finisce nei consumi. */
  accountId: string;
  brandId?: string | null;
}

/** Chi ha chiesto la generazione, per i consumi: lo passano i servizi a ogni compito. */
export type AiMeta = Pick<AiRequest<z.ZodType>, 'accountId' | 'brandId'>;

export interface AiUsage {
  task: AiTask;
  accountId: string;
  brandId: string | null;
  model: string;
  outcome: 'ok' | 'error';
  error: string | null;
  durationMs: number;
  turns: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface AiEngine {
  run<S extends z.ZodType>(request: AiRequest<S>): Promise<z.output<S>>;
}

/** Senza chiave: le rotte AI lo dicono, il resto dell'API funziona. */
export const unavailableEngine: AiEngine = {
  run() {
    return Promise.reject(ApiError.unavailable('AI_UNAVAILABLE', 'L’AI non è configurata su questo server.'));
  },
};

export interface AgentSdkEngineOptions {
  model: string;
  /** Dove si serve il modello, Anthropic o un fornitore terzo: vedi `providers.ts`. */
  target: ModelTarget;
  effort: Effort;
  timeoutMs: number;
  maxBudgetUsd: number;
  log: FastifyBaseLogger;
  /** Dove finiscono i consumi. Non blocca la risposta e un suo errore non la fa fallire. */
  recordUsage: (usage: AiUsage) => Promise<void>;
}

/** Con gli strumenti web servono più passi: cercare, aprire, rileggere. */
const MAX_TURNS_WITH_TOOLS = 14;
const MAX_TURNS_WITHOUT_TOOLS = 4;

export class AgentSdkEngine implements AiEngine {
  /** Una cartella vuota come directory di lavoro: la sessione non ha file da leggere. */
  private readonly workdir = join(tmpdir(), 'presenza-ai');

  constructor(private readonly options: AgentSdkEngineOptions) {
    mkdirSync(this.workdir, { recursive: true });
  }

  async run<S extends z.ZodType>(request: AiRequest<S>): Promise<z.output<S>> {
    const started = Date.now();
    const tools = request.tools ?? [];
    const abort = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      abort.abort();
    }, this.options.timeoutMs);

    // WebFetch apre pagine dal server: ogni indirizzo passa dallo stesso controllo delle rotte.
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

    let stderr = '';
    const options: Options = {
      cwd: this.workdir,
      model: this.options.model,
      // Su un fornitore terzo niente `effort`, che è di Anthropic, e niente tetto di spesa dell'SDK, che conta al
      // listino di Anthropic e scatterebbe a caso: restano i tetti di turni e di tempo.
      ...(!this.options.target.tariff && {
        effort: request.effort ?? this.options.effort,
        maxBudgetUsd: this.options.maxBudgetUsd,
      }),
      systemPrompt: request.system,
      tools,
      allowedTools: tools,
      // Niente richieste di permesso su un server: quello che non è pre-approvato è negato.
      permissionMode: 'dontAsk',
      settingSources: [],
      persistSession: false,
      maxTurns: tools.length > 0 ? MAX_TURNS_WITH_TOOLS : MAX_TURNS_WITHOUT_TOOLS,
      outputFormat: {
        type: 'json_schema',
        schema: z.toJSONSchema(request.schema, { target: 'draft-7' }) as Record<string, unknown>,
      },
      abortController: abort,
      hooks: { PreToolUse: [{ hooks: [guardUrls] }] },
      env: { ...(this.options.target.env ?? process.env), CLAUDE_AGENT_SDK_CLIENT_APP: 'presenza-be/0.1.0' },
      stderr: (data) => {
        stderr = `${stderr}${data}`.slice(-2000);
      },
    };

    let result: SDKResultMessage | undefined;
    let failure: unknown;
    try {
      for await (const message of query({ prompt: request.prompt, options })) {
        if (message.type === 'result') result = message;
      }
    } catch (error) {
      // Una sessione a colpo singolo lancia anche dopo aver consegnato un risultato d'errore.
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

    const tokens = sessionTokens(result);
    const { tariff } = this.options.target;
    const usage: AiUsage = {
      task: request.task,
      accountId: request.accountId,
      brandId: request.brandId ?? null,
      model: this.options.model,
      outcome: output === undefined ? 'error' : 'ok',
      error: problem,
      durationMs: Date.now() - started,
      turns: result?.num_turns ?? 0,
      costUsd: tariff ? costAtTariff(tokens, tariff) : (result?.total_cost_usd ?? 0),
      inputTokens: tokens.input,
      outputTokens: tokens.output,
      cacheReadTokens: tokens.cacheRead,
      cacheWriteTokens: tokens.cacheWrite,
    };
    void this.options
      .recordUsage(usage)
      .catch((error: unknown) => this.options.log.warn({ err: error }, 'consumi AI non registrati'));

    if (output !== undefined) return output;

    this.options.log.error({ task: request.task, problem, stderr: stderr || undefined }, 'generazione AI non riuscita');
    if (timedOut) {
      throw new ApiError(504, 'AI_TIMEOUT', 'La generazione ci sta mettendo troppo. Riprova tra poco.');
    }
    throw new ApiError(502, 'AI_FAILED', 'Non sono riuscito a completare la generazione. Riprova.');
  }
}

/** I token di tutta la sessione: `usage` conta il solo ciclo principale, `modelUsage` anche il riassunto di WebFetch. */
function sessionTokens(result: SDKResultMessage | undefined): TokenCount {
  const tokens: TokenCount = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  for (const model of Object.values(result?.modelUsage ?? {})) {
    tokens.input += model.inputTokens;
    tokens.output += model.outputTokens;
    tokens.cacheRead += model.cacheReadInputTokens;
    tokens.cacheWrite += model.cacheCreationInputTokens;
  }
  return tokens;
}
