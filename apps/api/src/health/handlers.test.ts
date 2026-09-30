import { CrmApi, HealthStatus } from "@crm/contract"
import { NodeHttpServer } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { HttpApiTest } from "effect/unstable/httpapi"
import { AuthorizationLive } from "../auth/middleware.ts"
import { TestDatabase } from "../testing/database.ts"
import { HealthLive } from "./handlers.ts"

const TestLayer = Layer.mergeAll(
  Layer.mergeAll(HealthLive, AuthorizationLive).pipe(Layer.provide(TestDatabase)),
  NodeHttpServer.layerHttpServices,
)

it.effect("GET /health/ready reports ok when the database responds", () =>
  Effect.gen(function* () {
    const client = yield* HttpApiTest.groups(CrmApi, ["health"])
    const status = yield* client.health.ready()
    expect(status).toEqual(new HealthStatus({ status: "ok" }))
  }).pipe(Effect.provide(TestLayer)),
)
