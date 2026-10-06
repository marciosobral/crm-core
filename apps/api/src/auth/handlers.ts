import {
  CrmApi,
  CurrentUser,
  InvalidCredentials,
  sessionCookie,
  TooManyLoginAttempts,
} from "@crm/contract"
import { Effect, Option, Redacted, Result } from "effect"
import { HttpEffect, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi"
import { failUnavailable } from "#src/platform/http.ts"
import { clientIpOf } from "./client-ip.ts"
import { LoginAttempts } from "./login-attempts.ts"
import { hashPassword, verifyPassword } from "./password.ts"
import { AuthRepository, toUser } from "./repository.ts"
import { hashSessionToken, makeSessionToken, sessionMaxAge } from "./session-token.ts"

const sessionCookieOptions = { sameSite: "lax", path: "/" } as const

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
          const clientIp = clientIpOf(yield* HttpServerRequest.HttpServerRequest)
          const verifyLogin = Effect.gen(function* () {
            const row = Option.getOrUndefined(yield* repository.findUserByEmail(payload.email))
            const isValid = yield* loginAttempts.withVerificationSlot(
              clientIp,
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
          const rejectRateLimited = (retryAfterSeconds: number) =>
            Effect.gen(function* () {
              yield* HttpEffect.appendPreResponseHandler((_request, response) =>
                Effect.succeed(
                  HttpServerResponse.setHeader(response, "retry-after", String(retryAfterSeconds)),
                ),
              )
              yield* Effect.logInfo("Login rate limited")
              return yield* new TooManyLoginAttempts({ retryAfterSeconds })
            })
          // Uninterruptible so no interruption can land between reserving and registering the release.
          // A request refused for parallel verifications releases its email reservation like any
          // other error, so it never counts as a failed password.
          const verification = yield* Effect.uninterruptibleMask((restore) =>
            Effect.gen(function* () {
              const clientReservation = yield* loginAttempts.reserveClientAttempt(clientIp)
              if (Result.isFailure(clientReservation)) return Result.fail(clientReservation.failure)
              const reservation = yield* loginAttempts.reserveAttempt(payload.email, clientIp)
              if (Result.isFailure(reservation)) return Result.fail(reservation.failure)
              const reservedAt = reservation.success
              return Result.succeed(
                yield* restore(verifyLogin).pipe(
                  Effect.onError(() =>
                    loginAttempts.releaseAttempt(payload.email, clientIp, reservedAt),
                  ),
                ),
              )
            }),
          ).pipe(Effect.catchTag("ClientVerificationBusy", () => rejectRateLimited(1)))
          if (Result.isFailure(verification)) return yield* rejectRateLimited(verification.failure)
          const { row, isValid } = verification.success
          if (!row || !isValid) {
            yield* Effect.logInfo("Login rejected")
            return yield* new InvalidCredentials()
          }
          yield* loginAttempts.clear(payload.email, clientIp)
          yield* repository.deleteExpiredSessions(row.id)
          const token = makeSessionToken()
          yield* repository.createSession({ id: hashSessionToken(token), userId: row.id })
          yield* HttpApiBuilder.securitySetCookie(sessionCookie, token, {
            ...sessionCookieOptions,
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
            ...sessionCookieOptions,
            maxAge: 0,
          })
        }),
      )
  }),
)
