import type { AiUsage } from '../ai/engine';
import type { Queryable } from '../db/pool';

/** Una riga per generazione, riuscita o no: tempi, token e costo, per account e per operazione. */
export async function recordUsage(db: Queryable, usage: AiUsage): Promise<void> {
  await db.query(
    `insert into presenza.ai_usage
       (account_id, brand_id, task, model, outcome, error, duration_ms, turns, cost_usd, input_tokens, output_tokens,
        cache_read_tokens, cache_write_tokens)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      usage.accountId,
      usage.brandId,
      usage.task,
      usage.model,
      usage.outcome,
      usage.error,
      usage.durationMs,
      usage.turns,
      usage.costUsd,
      usage.inputTokens,
      usage.outputTokens,
      usage.cacheReadTokens,
      usage.cacheWriteTokens,
    ],
  );
}
