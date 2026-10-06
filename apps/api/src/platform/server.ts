import { createServer } from "node:http"
import { businessTimeZone, CrmApi } from "@crm/contract"
import { NodeHttpServer } from "@effect/platform-node"
import { ByteSize, DateTime, Effect, Layer } from "effect"
import {
  HttpEffect,
  type HttpMethod,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { AssistantApiLive } from "#src/assistant/handlers.ts"
import { AssistantProviderLive } from "#src/assistant/provider.ts"
import { AssistantServicesLive } from "#src/assistant/services.ts"
import { AuthLive } from "#src/auth/handlers.ts"
import { LoginAttemptsLive } from "#src/auth/login-attempts.ts"
import { AuthorizationLive } from "#src/auth/middleware.ts"
import { AuthRepositoryLive } from "#src/auth/repository.ts"
import { DealsLive } from "#src/deals/handlers.ts"
import { DealsRepositoryLive } from "#src/deals/repository.ts"
import { HealthLive } from "#src/health/handlers.ts"
import { LeadsLive } from "#src/leads/handlers.ts"
import { LeadsRepositoryLive } from "#src/leads/repository.ts"
import { SellersLive } from "#src/sellers/handlers.ts"
import { SellersRepositoryLive } from "#src/sellers/repository.ts"
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
const unsafeMethods: ReadonlySet<HttpMethod.HttpMethod> = new Set([
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
])

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
    LeadsLive,
    DealsLive,
    SellersLive,
    AssistantApiLive,
    SecurityHeaders,
    BodySizeLimit,
    CrossOriginGuard,
  ]),
  Layer.provide(AuthorizationLive),
  Layer.provide([
    AssistantServicesLive.pipe(
      Layer.provideMerge(
        Layer.mergeAll(DealsRepositoryLive, LeadsRepositoryLive, SellersRepositoryLive),
      ),
    ),
    AuthRepositoryLive,
  ]),
  // An invalid zone id is a programming error, so it dies at startup instead of widening the layer error type.
  Layer.provide(DateTime.layerCurrentZoneNamed(businessTimeZone).pipe(Layer.orDie)),
)

export const ApiLive = ApiRoutes.pipe(
  Layer.provide(DatabaseLive),
  Layer.provide(AssistantProviderLive),
)

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
