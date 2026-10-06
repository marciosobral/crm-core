import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`
    CREATE TABLE ai_usage (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users (id),
      deal_id uuid REFERENCES deals (id),
      feature text NOT NULL CHECK (feature IN ('NEXT_STEP')),
      provider text NOT NULL,
      model text NOT NULL,
      reasoning_effort text,
      outcome text NOT NULL CHECK (outcome IN ('SUCCEEDED', 'FAILED')),
      input_tokens integer,
      cached_input_tokens integer,
      output_tokens integer,
      reasoning_tokens integer,
      duration_ms integer NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `
  yield* sql`CREATE INDEX ai_usage_user_id_created_at_idx ON ai_usage (user_id, created_at DESC)`
})
