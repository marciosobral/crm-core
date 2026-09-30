import { NodeHttpServer } from "@effect/platform-node"
import { Context, Effect, Layer } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { SqlClient } from "effect/unstable/sql"
import { ApiRoutes } from "../platform/server.ts"
import { TestDatabase } from "./database.ts"

// Raw web requests instead of HttpApiTest: the typed client cannot read or send cookies.
export const makeTestApi = Effect.gen(function* () {
  const database = yield* Layer.build(TestDatabase)
  const { handler } = yield* Effect.acquireRelease(
    Effect.sync(() =>
      HttpRouter.toWebHandler(
        ApiRoutes.pipe(
          Layer.provide(Layer.succeedContext(database)),
          Layer.provide(NodeHttpServer.layerHttpServices),
        ),
        { disableLogger: true },
      ),
    ),
    ({ dispose }) => Effect.promise(dispose),
  )
  return {
    send: (request: Request) => Effect.promise(() => handler(request)),
    sql: Context.get(database, SqlClient.SqlClient),
  }
})
