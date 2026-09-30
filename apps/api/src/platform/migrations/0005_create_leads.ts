import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`
    CREATE TABLE leads (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      company text NOT NULL,
      email text NOT NULL,
      phone text NOT NULL CHECK (phone ~ '^[0-9]{10,11}$'),
      job_title text,
      source text NOT NULL CHECK (source IN ('WEBSITE','REFERRAL','SOCIAL_MEDIA','EVENT','OUTBOUND','STORE','OTHER')),
      notes text,
      seller_id uuid NOT NULL REFERENCES users (id),
      created_by uuid NOT NULL REFERENCES users (id),
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `
  yield* sql`CREATE INDEX leads_seller_id_idx ON leads (seller_id)`
  yield* sql`CREATE INDEX leads_created_at_idx ON leads (created_at DESC)`
})
