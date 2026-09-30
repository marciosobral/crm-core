import { Role } from "@crm/contract"
import { expect, it } from "@effect/vitest"
import { Effect, Redacted, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { verifyPassword } from "../../auth/password.ts"
import { demoPassword, TestDatabase } from "../../testing/database.ts"

it.effect("creates the tables and seeds the sellers with hashed passwords", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const users = yield* sql`
      SELECT email, role, password_hash AS "passwordHash" FROM users ORDER BY email
    `.pipe(
      Effect.flatMap(
        Schema.decodeUnknownEffect(
          Schema.Array(
            Schema.Struct({ email: Schema.String, role: Role, passwordHash: Schema.String }),
          ),
        ),
      ),
    )
    expect(users.map(({ email, role }) => [email, role])).toEqual([
      ["ana.souza@crm-core.dev", "SELLER"],
      ["bruno.lima@crm-core.dev", "SELLER"],
      ["demo@crm-core.dev", "SUPERVISOR"],
    ])
    expect(users.map(({ email }) => email)).toEqual([
      "ana.souza@crm-core.dev",
      "bruno.lima@crm-core.dev",
      "demo@crm-core.dev",
    ])
    const demo = users.find(({ email }) => email === "demo@crm-core.dev")
    expect(yield* verifyPassword(Redacted.make(demoPassword), demo?.passwordHash ?? "")).toBe(true)
    const sessions = yield* sql`SELECT count(*)::int AS count FROM sessions`.pipe(
      Effect.flatMap(
        Schema.decodeUnknownEffect(Schema.Tuple([Schema.Struct({ count: Schema.Number })])),
      ),
    )
    expect(sessions[0].count).toBe(0)
  }).pipe(Effect.provide(TestDatabase)),
)
