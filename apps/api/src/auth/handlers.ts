import { CrmApi, CurrentUser, InvalidCredentials, sessionCookie, User } from "@crm/contract"
import { Effect, Redacted } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { SqlClient } from "effect/unstable/sql"
import { hashPassword, verifyPassword } from "./password.ts"
import { hashSessionToken, makeSessionToken, sessionMaxAge } from "./session-token.ts"
import { failUnavailable } from "./unavailable.ts"

export const AuthLive = HttpApiBuilder.group(CrmApi, "auth", (handlers) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    // Unknown emails are still verified against this hash so both failures take the same time.
    const dummyHash = yield* hashPassword(Redacted.make("dummy-password"))

    return handlers
      .handle("login", ({ payload }) =>
        Effect.gen(function* () {
          const password = Redacted.make(payload.password)
          const rows = yield* sql<{
            id: string
            name: string
            email: string
            passwordHash: string
          }>`
            SELECT id, name, email, password_hash AS "passwordHash"
            FROM users WHERE lower(email) = lower(${payload.email})
          `
          const row = rows[0]
          const isValid = yield* verifyPassword(password, row?.passwordHash ?? dummyHash)
          if (!row || !isValid) {
            yield* Effect.logInfo("Login rejected")
            return yield* new InvalidCredentials()
          }
          yield* sql`DELETE FROM sessions WHERE user_id = ${row.id} AND expires_at <= now()`
          const token = makeSessionToken()
          yield* sql`
            INSERT INTO sessions (id, user_id, expires_at)
            VALUES (${hashSessionToken(token)}, ${row.id}, now() + ${sessionMaxAge}::interval)
          `
          yield* HttpApiBuilder.securitySetCookie(sessionCookie, token, {
            sameSite: "lax",
            path: "/",
            maxAge: sessionMaxAge,
          })
          yield* Effect.logInfo("Login succeeded").pipe(Effect.annotateLogs({ userId: row.id }))
          return new User({ id: row.id, name: row.name, email: row.email })
        }).pipe(Effect.catchTag("SqlError", failUnavailable)),
      )
      .handle("me", () =>
        Effect.gen(function* () {
          return yield* CurrentUser
        }),
      )
      .handle("logout", () =>
        Effect.gen(function* () {
          const token = yield* HttpApiBuilder.securityDecode(sessionCookie)
          yield* sql`DELETE FROM sessions WHERE id = ${hashSessionToken(Redacted.value(token))}`.pipe(
            Effect.catchTag("SqlError", failUnavailable),
          )
          yield* HttpApiBuilder.securitySetCookie(sessionCookie, "", {
            sameSite: "lax",
            path: "/",
            maxAge: 0,
          })
        }),
      )
  }),
)
