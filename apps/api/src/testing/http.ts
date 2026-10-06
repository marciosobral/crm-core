import { NodeHttpServer } from "@effect/platform-node"
import { Context, Effect, Layer } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { SqlClient } from "effect/unstable/sql"
import { ApiRoutes } from "#src/platform/server.ts"
import { TestDatabase } from "./database.ts"

export type Send = (request: Request) => Effect.Effect<Response>

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

export const jsonOf = (response: Response) => Effect.promise(() => response.json())

export const jsonRequest = (
  method: "POST" | "PATCH",
  path: string,
  body: unknown,
  cookie?: string,
) =>
  new Request(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  })

export const loginRequest = (email: string, password: string) =>
  jsonRequest("POST", "/auth/login", { email, password })

export const sessionCookieOf = (response: Response) =>
  response.headers.get("set-cookie")?.split(";")[0] ?? ""

export const loginAs = (send: Send, email: string, password: string) =>
  Effect.map(send(loginRequest(email, password)), sessionCookieOf)
