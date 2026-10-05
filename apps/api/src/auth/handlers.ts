import {
  CrmApi,
  CurrentUser,
  InvalidCredentials,
  sessionCookie,
  TooManyLoginAttempts,
} from "@crm/contract"
import { Effect, Option, Redacted, Result } from "effect"
import { HttpEffect, HttpServerResponse } from "effect/unstable/http"
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi"
import { failUnavailable } from "#src/platform/unavailable.ts"
import { LoginAttempts } from "./login-attempts.ts"
import { hashPassword, verifyPassword } from "./password.ts"
import { AuthRepository, toUser } from "./repository.ts"
import { hashSessionToken, makeSessionToken, sessionMaxAge } from "./session-token.ts"

export const AuthLive = HttpApiBuilder.group(CrmApi, "auth", (handlers) =>
  Effect.gen(function* () {
    const repository = yield* AuthRepository
    const loginAttempts = yield* LoginAttempts
    // Unknown emails are still verified against this hash so both failures take the same time.
    const dummyHash = yield* hashPassword(Redacted.make("dummy-password"))

    return handlers
      .handle("login", ({ payload }) =>
        Effect.gen(function* () {
          const password = Redacted.make(payload.password)
          const verifyLogin = Effect.gen(function* () {
            const row = Option.getOrUndefined(yield* repository.findUserByEmail(payload.email))
            const isValid = yield* loginAttempts.withVerificationSlot(
              verifyPassword(password, row?.passwordHash ?? dummyHash),
            )
            return { row, isValid }
          }).pipe(
            Effect.catchTag("VerificationQueueFull", () =>
              Effect.logWarning("Login verification queue full").pipe(
                Effect.andThen(Effect.fail(new HttpApiError.ServiceUnavailable())),
              ),
            ),
          )
          // Uninterruptible so no interruption can land between reserving and registering the release.
          const verification = yield* Effect.uninterruptibleMask((restore) =>
            Effect.gen(function* () {
              const reservation = yield* loginAttempts.reserveAttempt(payload.email)
              if (Result.isFailure(reservation)) return Result.fail(reservation.failure)
              const reservedAt = reservation.success
              return Result.succeed(
                yield* restore(verifyLogin).pipe(
                  Effect.onError(() => loginAttempts.releaseAttempt(payload.email, reservedAt)),
                ),
              )
            }),
          )
          if (Result.isFailure(verification)) {
            const retryAfterSeconds = verification.failure
            yield* HttpEffect.appendPreResponseHandler((_request, response) =>
              Effect.succeed(
                HttpServerResponse.setHeader(response, "retry-after", String(retryAfterSeconds)),
              ),
            )
            yield* Effect.logInfo("Login rate limited")
            return yield* new TooManyLoginAttempts({ retryAfterSeconds })
          }
          const { row, isValid } = verification.success
          if (!row || !isValid) {
            yield* Effect.logInfo("Login rejected")
            return yield* new InvalidCredentials()
          }
          yield* loginAttempts.clear(payload.email)
          yield* repository.deleteExpiredSessions(row.id)
          const token = makeSessionToken()
          yield* repository.createSession({ id: hashSessionToken(token), userId: row.id })
          yield* HttpApiBuilder.securitySetCookie(sessionCookie, token, {
            sameSite: "lax",
            path: "/",
            maxAge: sessionMaxAge,
          })
          yield* Effect.logInfo("Login succeeded").pipe(Effect.annotateLogs({ userId: row.id }))
          return toUser(row)
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
          yield* repository
            .deleteSession(hashSessionToken(Redacted.value(token)))
            .pipe(Effect.catchTag("SqlError", failUnavailable))
          yield* HttpApiBuilder.securitySetCookie(sessionCookie, "", {
            sameSite: "lax",
            path: "/",
            maxAge: 0,
          })
        }),
      )
  }),
)
