import { PgClient } from "@effect/sql-pg"
import { Config, Effect, Layer, Option } from "effect"
import type { SqlClient, SqlError } from "effect/unstable/sql"
import { DatabaseConfig } from "./config.ts"
import { MigrationsLive } from "./migrations/index.ts"

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
        })
      }
      const url = yield* Config.Redacted("DATABASE_URL")
      return PgClient.layer({ url })
    }),
  )
export const DatabaseLive = MigrationsLive.pipe(Layer.provideMerge(SqlLive))
