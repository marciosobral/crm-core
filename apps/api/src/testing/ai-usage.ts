import { Effect, Schema } from "effect"
import type { SqlClient } from "effect/unstable/sql"

const AiUsageRows = Schema.Array(
  Schema.Struct({
    userId: Schema.String,
    dealId: Schema.NullOr(Schema.String),
    feature: Schema.String,
    provider: Schema.String,
    model: Schema.String,
    reasoningEffort: Schema.NullOr(Schema.String),
    outcome: Schema.String,
    inputTokens: Schema.NullOr(Schema.Number),
    cachedInputTokens: Schema.NullOr(Schema.Number),
    outputTokens: Schema.NullOr(Schema.Number),
    reasoningTokens: Schema.NullOr(Schema.Number),
    durationMs: Schema.Number,
  }),
)

export const aiUsageRows = (sql: SqlClient.SqlClient) =>
  sql`
    SELECT user_id AS "userId", deal_id AS "dealId", feature, provider, model,
           reasoning_effort AS "reasoningEffort", outcome, input_tokens AS "inputTokens",
           cached_input_tokens AS "cachedInputTokens", output_tokens AS "outputTokens",
           reasoning_tokens AS "reasoningTokens", duration_ms AS "durationMs"
    FROM ai_usage ORDER BY created_at
  `.pipe(Effect.flatMap(Schema.decodeUnknownEffect(AiUsageRows)))
