import { Authorization, CurrentUser } from "@crm/contract"
import { Effect, Layer, Option, Redacted } from "effect"
import { HttpApiError } from "effect/unstable/httpapi"
import { AuthRepository } from "./repository.ts"
import { hashSessionToken } from "./session-token.ts"
import { failUnavailable } from "./unavailable.ts"

export const AuthorizationLive = Layer.effect(
  Authorization,
  Effect.gen(function* () {
    const repository = yield* AuthRepository
    return {
      session: (httpEffect, { credential }) =>
        Effect.gen(function* () {
          const token = Redacted.value(credential)
          if (token === "") return yield* new HttpApiError.Unauthorized()
          const user = yield* repository
            .findUserBySession(hashSessionToken(token))
            .pipe(Effect.catchTag("SqlError", failUnavailable))
          if (Option.isNone(user)) return yield* new HttpApiError.Unauthorized()
          return yield* Effect.provideService(httpEffect, CurrentUser, user.value)
        }),
    }
  }),
)
