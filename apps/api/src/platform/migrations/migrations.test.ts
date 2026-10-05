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

const decodeIdRow = Schema.decodeUnknownEffect(Schema.Tuple([Schema.Struct({ id: Schema.String })]))

it.effect("rejects a closed deal that has no loss reason", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [seller] = yield* sql`SELECT id FROM users WHERE email = 'ana.souza@crm-core.dev'`.pipe(
      Effect.flatMap(decodeIdRow),
    )
    const [lead] = yield* sql`
      INSERT INTO leads (name, company, email, phone, source, seller_id, created_by)
      VALUES ('Thiago Lima', 'Academia X', 'thiago@academiax.com.br', '11983111234', 'REFERRAL', ${seller.id}, ${seller.id})
      RETURNING id
    `.pipe(Effect.flatMap(decodeIdRow))
    const [deal] = yield* sql`
      INSERT INTO deals (title, value_cents, status, lead_id, seller_id, created_by)
      VALUES ('Kit Completo', 100, 'NEW', ${lead.id}, ${seller.id}, ${seller.id})
      RETURNING id
    `.pipe(Effect.flatMap(decodeIdRow))
    const error = yield* sql`UPDATE deals SET status = 'LOST' WHERE id = ${deal.id}`.pipe(
      Effect.flip,
    )
    expect(error._tag).toBe("SqlError")
  }).pipe(Effect.provide(TestDatabase)),
)
