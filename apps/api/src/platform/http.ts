import { Effect } from "effect"
import { HttpApiError } from "effect/unstable/httpapi"
import type { SqlError } from "effect/unstable/sql"

// Only the reason tag is logged: the driver message and cause can carry row values (emails, names).
export const logSqlFailure = (error: SqlError.SqlError) =>
  Effect.logError("Database query failed").pipe(
    Effect.annotateLogs({ sqlErrorReason: error.reason._tag }),
  )

export const failUnavailable = (error: SqlError.SqlError) =>
  logSqlFailure(error).pipe(Effect.andThen(Effect.fail(new HttpApiError.ServiceUnavailable())))

export const nullIfBlank = (text: string | undefined) =>
  text === undefined || text.trim() === "" ? null : text
