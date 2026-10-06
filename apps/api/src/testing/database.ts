import { PgliteClient } from "@effect/sql-pglite"
import { ConfigProvider, Effect, Layer, Schema } from "effect"
import type { SqlClient } from "effect/unstable/sql"
import { PgliteUtcSession } from "#src/platform/db.ts"
import { MigrationsLive } from "#src/platform/migrations/index.ts"

export const demoPassword = "demo-test-password"
export const sellerPassword = "seller-test-password"

export const seededEmails = {
  demo: "demo@crm-core.dev",
  ana: "ana.souza@crm-core.dev",
  bruno: "bruno.lima@crm-core.dev",
} as const

export const TestDatabase = MigrationsLive.pipe(
  Layer.provideMerge(PgliteUtcSession.pipe(Layer.provideMerge(PgliteClient.layer()))),
  Layer.provide(
    ConfigProvider.layer(
      ConfigProvider.fromUnknown({
        SEED_DEMO_PASSWORD: demoPassword,
        SEED_SELLER_PASSWORD: sellerPassword,
      }),
    ),
  ),
)

const decodeUsers = Schema.decodeUnknownEffect(
  Schema.Array(Schema.Struct({ id: Schema.String, email: Schema.String })),
)

export const seededUserIds = (sql: SqlClient.SqlClient) =>
  Effect.gen(function* () {
    const users = yield* decodeUsers(yield* sql`SELECT id, email FROM users`).pipe(Effect.orDie)
    const idOf = (email: string) => users.find((user) => user.email === email)?.id ?? ""
    return {
      ana: idOf(seededEmails.ana),
      bruno: idOf(seededEmails.bruno),
      demo: idOf(seededEmails.demo),
    }
  })
