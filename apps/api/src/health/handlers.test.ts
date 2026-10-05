import { CrmApi, HealthStatus } from "@crm/contract"
import { NodeHttpServer } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { HttpApiTest } from "effect/unstable/httpapi"
import { AuthorizationLive } from "#src/auth/middleware.ts"
import { AuthRepositoryLive } from "#src/auth/repository.ts"
import { TestDatabase } from "#src/testing/database.ts"
import { HealthLive } from "./handlers.ts"

const TestLayer = Layer.mergeAll(
  Layer.mergeAll(HealthLive, AuthorizationLive).pipe(
    Layer.provide(AuthRepositoryLive),
    Layer.provide(TestDatabase),
  ),
  NodeHttpServer.layerHttpServices,
)

it.effect("GET /health/ready reports ok when the database responds", () =>
  Effect.gen(function* () {
    const client = yield* HttpApiTest.groups(CrmApi, ["health"])
    const status = yield* client.health.ready()
    expect(status).toEqual(new HealthStatus({ status: "ok" }))
  }).pipe(Effect.provide(TestLayer)),
)
