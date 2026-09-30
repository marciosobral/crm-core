import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`
    ALTER TABLE users
    ADD COLUMN role text NOT NULL DEFAULT 'SELLER' CHECK (role IN ('SUPERVISOR', 'SELLER'))
  `
  yield* sql`UPDATE users SET role = 'SUPERVISOR' WHERE lower(email) = 'demo@crm-core.dev'`
})
