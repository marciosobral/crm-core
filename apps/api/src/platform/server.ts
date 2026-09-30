import { createServer } from "node:http"
import { CrmApi } from "@crm/contract"
import { NodeHttpServer } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { AuthLive } from "../auth/handlers.ts"
import { AuthorizationLive } from "../auth/middleware.ts"
import { HealthLive } from "../health/handlers.ts"
import { ServerConfig } from "./config.ts"
import { DatabaseLive } from "./db.ts"

export const ApiRoutes = HttpApiBuilder.layer(CrmApi).pipe(
  Layer.provide([HealthLive, AuthLive]),
  Layer.provide(AuthorizationLive),
)

export const ApiLive = ApiRoutes.pipe(Layer.provide(DatabaseLive))

export const ServerLive = Layer.unwrap(
  Effect.gen(function* () {
    const { port, corsOrigin } = yield* ServerConfig
    return HttpRouter.serve(
      Layer.mergeAll(ApiLive, HttpRouter.cors({ allowedOrigins: [corsOrigin], credentials: true })),
    ).pipe(Layer.provide(NodeHttpServer.layer(createServer, { port })))
  }),
)
