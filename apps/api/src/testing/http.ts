import { NodeHttpServer } from "@effect/platform-node"
import { Context, Effect, Layer } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { SqlClient } from "effect/unstable/sql"
import { ApiRoutes } from "#src/platform/server.ts"
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

const loginRequest = (email: string, password: string) =>
  new Request("http://localhost/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  })

export const loginAs = (
  send: (request: Request) => Effect.Effect<Response>,
  email: string,
  password: string,
) =>
  Effect.map(
    send(loginRequest(email, password)),
    (response) => response.headers.get("set-cookie")?.split(";")[0] ?? "",
  )
