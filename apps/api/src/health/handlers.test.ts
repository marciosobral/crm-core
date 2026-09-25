import { CrmApi, HealthStatus } from "@crm/contract"
import { NodeHttpServer } from "@effect/platform-node"
import { PgliteClient } from "@effect/sql-pglite"
import { expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { HttpApiTest } from "effect/unstable/httpapi"
import { HealthLive } from "./handlers.ts"

const TestLayer = Layer.mergeAll(
  HealthLive.pipe(Layer.provide(PgliteClient.layer())),
  NodeHttpServer.layerHttpServices,
)

it.effect("GET /health/ready reports ok when the database responds", () =>
  Effect.gen(function* () {
    const client = yield* HttpApiTest.groups(CrmApi, ["health"])
    const status = yield* client.health.ready()
    expect(status).toEqual(new HealthStatus({ status: "ok" }))
  }).pipe(Effect.provide(TestLayer)),
)
