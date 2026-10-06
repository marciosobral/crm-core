import { Context, Effect, Layer, Schema } from "effect"
import { SqlClient, type SqlError, SqlSchema } from "effect/unstable/sql"
import { dieOnSchemaError } from "#src/platform/sql.ts"

const NewAiUsage = Schema.Struct({
  userId: Schema.String,
  dealId: Schema.NullOr(Schema.String),
  feature: Schema.Literals(["NEXT_STEP"]),
  provider: Schema.String,
  model: Schema.String,
  reasoningEffort: Schema.NullOr(Schema.String),
  outcome: Schema.Literals(["SUCCEEDED", "FAILED"]),
  inputTokens: Schema.NullOr(Schema.Int),
  cachedInputTokens: Schema.NullOr(Schema.Int),
  outputTokens: Schema.NullOr(Schema.Int),
  reasoningTokens: Schema.NullOr(Schema.Int),
  durationMs: Schema.Int,
})

export class AiUsageRepository extends Context.Service<
  AiUsageRepository,
  {
    readonly record: (entry: typeof NewAiUsage.Type) => Effect.Effect<void, SqlError.SqlError>
  }
>()("AiUsageRepository") {}

export const AiUsageRepositoryLive = Layer.effect(
  AiUsageRepository,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const insert = SqlSchema.void({
      Request: NewAiUsage,
      execute: (entry) => sql`
        INSERT INTO ai_usage (user_id, deal_id, feature, provider, model, reasoning_effort, outcome,
                              input_tokens, cached_input_tokens, output_tokens, reasoning_tokens,
                              duration_ms)
        VALUES (${entry.userId}, ${entry.dealId}, ${entry.feature}, ${entry.provider}, ${entry.model},
                ${entry.reasoningEffort}, ${entry.outcome}, ${entry.inputTokens},
                ${entry.cachedInputTokens}, ${entry.outputTokens}, ${entry.reasoningTokens},
                ${entry.durationMs})
      `,
    })

    return AiUsageRepository.of({
      record: (entry) => dieOnSchemaError(insert(entry)),
    })
  }),
)
