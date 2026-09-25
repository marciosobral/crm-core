import { createServer } from "node:http"
import { CrmApi } from "@crm/contract"
import { NodeHttpServer } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { HealthLive } from "../health/handlers.ts"
import { ServerConfig } from "./config.ts"
import { SqlLive } from "./db.ts"

export const ApiLive = HttpApiBuilder.layer(CrmApi).pipe(
  Layer.provide(HealthLive),
  Layer.provide(SqlLive),
)

export const ServerLive = Layer.unwrap(
  Effect.gen(function* () {
    const { port, corsOrigin } = yield* ServerConfig
    return HttpRouter.serve(
      Layer.mergeAll(ApiLive, HttpRouter.cors({ allowedOrigins: [corsOrigin] })),
    ).pipe(Layer.provide(NodeHttpServer.layer(createServer, { port })))
  }),
)
