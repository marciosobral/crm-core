import { expect, it } from "@effect/vitest"
import { Effect, Redacted } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { verifyPassword } from "../../auth/password.ts"
import { demoPassword, TestDatabase } from "../../testing/database.ts"

it.effect("creates the tables and seeds the sellers with hashed passwords", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const users = yield* sql<{ email: string; passwordHash: string }>`
      SELECT email, password_hash AS "passwordHash" FROM users ORDER BY email
    `
    expect(users.map(({ email }) => email)).toEqual([
      "ana.souza@crm-core.dev",
      "bruno.lima@crm-core.dev",
      "demo@crm-core.dev",
    ])
    const demo = users.find(({ email }) => email === "demo@crm-core.dev")
    expect(yield* verifyPassword(Redacted.make(demoPassword), demo?.passwordHash ?? "")).toBe(true)
    const sessions = yield* sql<{ count: number }>`SELECT count(*)::int AS count FROM sessions`
    expect(sessions[0]?.count).toBe(0)
  }).pipe(Effect.provide(TestDatabase)),
)
