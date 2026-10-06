import { PgClient } from "@effect/sql-pg"
import { Config, Effect, Layer, Option } from "effect"
import { SqlClient, type SqlError } from "effect/unstable/sql"
import { DatabaseConfig } from "./config.ts"
import { MigrationsLive } from "./migrations/index.ts"

// PGlite has no connection options, so the session zone is set once after the client starts.
export const PgliteUtcSession = Layer.effectDiscard(
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`SET TIME ZONE 'UTC'`
  }),
)

export const SqlLive: Layer.Layer<SqlClient.SqlClient, SqlError.SqlError | Config.ConfigError> =
  Layer.unwrap(
    Effect.gen(function* () {
      const { usePglite, pgliteDataDir } = yield* DatabaseConfig
      if (usePglite) {
        // Dev-only dependency: loaded on demand so it stays out of the production image.
        const { PgliteClient } = yield* Effect.promise(() => import("@effect/sql-pglite"))
        return Option.match(pgliteDataDir, {
          onNone: () => PgliteClient.layer(),
          onSome: (dataDir) => PgliteClient.layer({ dataDir }),
        }).pipe((client) => PgliteUtcSession.pipe(Layer.provideMerge(client)))
      }
      const url = yield* Config.Redacted("DATABASE_URL")
      return PgClient.layer({ url, startupParameters: { timezone: "UTC" } })
    }),
  )
export const DatabaseLive = MigrationsLive.pipe(Layer.provideMerge(SqlLive))
