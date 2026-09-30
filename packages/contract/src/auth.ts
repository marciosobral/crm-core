import { Context, Schema } from "effect"
import {
  HttpApiEndpoint,
  HttpApiError,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpApiSecurity,
} from "effect/unstable/httpapi"
import { Permission, Role } from "./permissions.ts"

export class User extends Schema.Class<User>("User")({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
  role: Role,
  permissions: Schema.Array(Permission),
}) {}

export const LoginPayload = Schema.Struct({
  email: Schema.Trim.check(Schema.isNonEmpty(), Schema.isMaxLength(254)),
  password: Schema.NonEmptyString.check(Schema.isMaxLength(256)),
})

export class InvalidCredentials extends Schema.TaggedError<InvalidCredentials>()(
  "InvalidCredentials",
  {},
  { httpApiStatus: 401 },
) {}

export class TooManyLoginAttempts extends Schema.TaggedError<TooManyLoginAttempts>()(
  "TooManyLoginAttempts",
  { retryAfterSeconds: Schema.Int },
  { httpApiStatus: 429 },
) {}

export class CurrentUser extends Context.Service<CurrentUser, User>()("crm/CurrentUser") {}

export const sessionCookie = HttpApiSecurity.apiKey({ in: "cookie", key: "__Host-crm_session" })

export class Authorization extends HttpApiMiddleware.Service<
  Authorization,
  { provides: CurrentUser }
>()("crm/Authorization", {
  error: [HttpApiError.Unauthorized, HttpApiError.ServiceUnavailable],
  security: { session: sessionCookie },
}) {}

export class AuthGroup extends HttpApiGroup.make("auth")
  .add(
    HttpApiEndpoint.post("login", "/auth/login", {
      payload: LoginPayload,
      success: User,
      error: [InvalidCredentials, TooManyLoginAttempts, HttpApiError.ServiceUnavailable],
    }),
  )
  .add(HttpApiEndpoint.get("me", "/auth/me", { success: User }).middleware(Authorization))
  .add(
    HttpApiEndpoint.post("logout", "/auth/logout", {
      error: HttpApiError.ServiceUnavailable,
    }).middleware(Authorization),
  ) {}
