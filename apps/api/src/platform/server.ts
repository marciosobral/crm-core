import { createServer } from "node:http"
import { CrmApi } from "@crm/contract"
import { NodeHttpServer } from "@effect/platform-node"
import { ByteSize, Effect, Layer } from "effect"
import { HttpEffect, HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { AuthLive } from "../auth/handlers.ts"
import { LoginAttemptsLive } from "../auth/login-attempts.ts"
import { AuthorizationLive } from "../auth/middleware.ts"
import { HealthLive } from "../health/handlers.ts"
import { ServerConfig } from "./config.ts"
import { DatabaseLive } from "./db.ts"

const maxBodySize = ByteSize.kibibytes(64)

// MaxBodySize alone aborts the connection without a response, so declared oversized
// bodies are answered with 413 up front; the reference still caps chunked bodies.
const BodySizeLimit = HttpRouter.middleware(
  (httpEffect) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      const declaredLength = Number(request.headers["content-length"] ?? 0)
      if (declaredLength > ByteSize.toNumberUnsafe(maxBodySize))
        return HttpServerResponse.empty({ status: 413 })
      return yield* Effect.provideService(httpEffect, HttpServerRequest.MaxBodySize, maxBodySize)
    }),
  { global: true },
)

// No includeSubDomains: sibling subdomains of the zone are not ours to pin.
const SecurityHeaders = HttpRouter.middleware(
  (httpEffect) =>
    Effect.andThen(
      HttpEffect.appendPreResponseHandler((_request, response) =>
        Effect.succeed(
          HttpServerResponse.setHeaders(response, {
            "x-content-type-options": "nosniff",
            "strict-transport-security": "max-age=31536000",
            "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
            "referrer-policy": "no-referrer",
          }),
        ),
      ),
      httpEffect,
    ),
  { global: true },
)

// SameSite=Lax does not separate sibling subdomains, so unsafe requests carrying a foreign
// Origin are refused. Requests without Origin come from non-browser clients and pass.
const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"])

const CrossOriginGuard = HttpRouter.middleware(
  Effect.gen(function* () {
    const { corsOrigin } = yield* ServerConfig
    return (httpEffect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const origin = request.headers.origin
        if (unsafeMethods.has(request.method) && origin !== undefined && origin !== corsOrigin)
          return HttpServerResponse.empty({ status: 403 })
        return yield* httpEffect
      })
  }),
  { global: true },
)

export const ApiRoutes = HttpApiBuilder.layer(CrmApi).pipe(
  Layer.provide([
    HealthLive,
    AuthLive.pipe(Layer.provide(LoginAttemptsLive)),
    SecurityHeaders,
    BodySizeLimit,
    CrossOriginGuard,
  ]),
  Layer.provide(AuthorizationLive),
)

export const ApiLive = ApiRoutes.pipe(Layer.provide(DatabaseLive))

export const ServerLive = Layer.unwrap(
  Effect.gen(function* () {
    const { port, corsOrigin } = yield* ServerConfig
    return HttpRouter.serve(
      Layer.mergeAll(ApiLive, HttpRouter.cors({ allowedOrigins: [corsOrigin], credentials: true })),
    ).pipe(
      Layer.provide(
        NodeHttpServer.layer(
          () =>
            createServer({
              headersTimeout: 10_000,
              requestTimeout: 30_000,
              // Node only enforces the timeouts on this interval (default 30s), which would delay the 10s limit.
              connectionsCheckingInterval: 1_000,
            }),
          { port },
        ),
      ),
    )
  }),
)
