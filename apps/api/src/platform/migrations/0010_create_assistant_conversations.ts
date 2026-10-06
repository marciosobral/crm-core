import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`ALTER TABLE ai_usage DROP CONSTRAINT ai_usage_feature_check`
  yield* sql`
    ALTER TABLE ai_usage ADD CONSTRAINT ai_usage_feature_check
      CHECK (feature IN ('NEXT_STEP', 'ASSISTANT_CHAT', 'ASSISTANT_SUMMARY'))
  `
  yield* sql`
    CREATE TABLE assistant_conversations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users (id),
      title text NOT NULL,
      summary text,
      summarized_up_to integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `
  yield* sql`
    CREATE INDEX assistant_conversations_user_id_updated_at_idx
      ON assistant_conversations (user_id, updated_at DESC)
  `
  yield* sql`
    CREATE TABLE assistant_messages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id uuid NOT NULL REFERENCES assistant_conversations (id) ON DELETE CASCADE,
      seq bigint GENERATED ALWAYS AS IDENTITY,
      role text NOT NULL CHECK (role IN ('USER', 'ASSISTANT')),
      content text NOT NULL,
      links jsonb NOT NULL DEFAULT '[]',
      tool_trace jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `
  yield* sql`
    CREATE INDEX assistant_messages_conversation_id_seq_idx
      ON assistant_messages (conversation_id, seq)
  `
})
