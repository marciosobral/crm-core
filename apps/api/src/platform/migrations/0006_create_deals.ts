import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`
    CREATE TABLE deals (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title text NOT NULL,
      value_cents bigint NOT NULL CHECK (value_cents > 0),
      status text NOT NULL CHECK (status IN ('NEW','CONTACTED','PROPOSAL_SENT','NEGOTIATION','WON','LOST')),
      expected_close_date date,
      description text,
      lead_id uuid NOT NULL REFERENCES leads (id),
      seller_id uuid NOT NULL REFERENCES users (id),
      created_by uuid NOT NULL REFERENCES users (id),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `
  yield* sql`CREATE INDEX deals_lead_id_idx ON deals (lead_id)`
  yield* sql`CREATE INDEX deals_seller_id_idx ON deals (seller_id)`
  yield* sql`CREATE INDEX deals_created_at_idx ON deals (created_at DESC)`
})
