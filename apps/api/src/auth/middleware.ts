import { Authorization, CurrentUser, User } from "@crm/contract"
import { Effect, Layer, Redacted } from "effect"
import { HttpApiError } from "effect/unstable/httpapi"
import { SqlClient } from "effect/unstable/sql"
import { hashSessionToken } from "./session-token.ts"
import { failUnavailable } from "./unavailable.ts"

export const AuthorizationLive = Layer.effect(
  Authorization,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    return {
      session: (httpEffect, { credential }) =>
        Effect.gen(function* () {
          const token = Redacted.value(credential)
          if (token === "") return yield* new HttpApiError.Unauthorized()
          const rows = yield* sql<{ id: string; name: string; email: string }>`
            SELECT u.id, u.name, u.email
            FROM sessions s JOIN users u ON u.id = s.user_id
            WHERE s.id = ${hashSessionToken(token)} AND s.expires_at > now()
          `.pipe(Effect.catchTag("SqlError", failUnavailable))
          const row = rows[0]
          if (!row) return yield* new HttpApiError.Unauthorized()
          return yield* Effect.provideService(httpEffect, CurrentUser, new User(row))
        }),
    }
  }),
)
