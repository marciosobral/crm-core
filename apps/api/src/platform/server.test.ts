import { NodeHttpServer } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { HttpClient, HttpClientRequest, HttpRouter } from "effect/unstable/http"
import { demoPassword, TestDatabase } from "#src/testing/database.ts"
import { makeTestApi } from "#src/testing/http.ts"
import { ApiRoutes } from "./server.ts"

const ServerTestLayer = HttpRouter.serve(ApiRoutes, { disableLogger: true }).pipe(
  Layer.provide(TestDatabase),
  Layer.provideMerge(NodeHttpServer.layerTest),
)

it.live("rejects request bodies above the size limit", () =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    const response = yield* client.execute(
      HttpClientRequest.post("/auth/login").pipe(
        HttpClientRequest.bodyJsonUnsafe({
          email: "demo@crm-core.dev",
          password: "a".repeat(100 * 1024),
        }),
      ),
    )
    expect(response.status).toBe(413)
  }).pipe(Effect.provide(ServerTestLayer)),
)

const expectedSecurityHeaders: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "strict-transport-security": "max-age=31536000",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  "referrer-policy": "no-referrer",
}

const oversizedLogin = new Request("http://localhost/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json", "content-length": String(100 * 1024) },
  body: "{}",
})

const foreignOriginLogin = new Request("http://localhost/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json", origin: "https://evil.example" },
  body: "{}",
})

it.effect("adds security headers to every response", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    const cases: ReadonlyArray<readonly [string, () => Request, number]> = [
      ["success", () => new Request("http://localhost/health"), 200],
      ["unauthorized", () => new Request("http://localhost/auth/me"), 401],
      ["route not found", () => new Request("http://localhost/nope"), 404],
      ["body too large", () => oversizedLogin.clone(), 413],
      ["foreign origin", () => foreignOriginLogin.clone(), 403],
    ]
    for (const [label, makeRequest, status] of cases) {
      const response = yield* send(makeRequest())
      expect(response.status, label).toBe(status)
      for (const [name, value] of Object.entries(expectedSecurityHeaders)) {
        expect(response.headers.get(name), `${label} ${name}`).toBe(value)
      }
    }
  }).pipe(Effect.scoped),
)

const foreignOrigin = "https://evil.example"
const allowedOrigin = "http://localhost:5173"

const loginWithOrigin = (origin: string) =>
  new Request("http://localhost/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ email: "demo@crm-core.dev", password: demoPassword }),
  })

it.effect("rejects unsafe requests from a foreign origin before running the handler", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    const blockedLogin = yield* send(loginWithOrigin(foreignOrigin))
    expect(blockedLogin.status).toBe(403)
    expect(blockedLogin.headers.get("set-cookie")).toBeNull()
    expect(yield* Effect.promise(() => blockedLogin.text())).toBe("")

    const login = yield* send(loginWithOrigin(allowedOrigin))
    expect(login.status).toBe(200)
    const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? ""

    const blockedLogout = yield* send(
      new Request("http://localhost/auth/logout", {
        method: "POST",
        headers: { cookie, origin: foreignOrigin },
      }),
    )
    expect(blockedLogout.status).toBe(403)
    const me = yield* send(new Request("http://localhost/auth/me", { headers: { cookie } }))
    expect(me.status).toBe(200)

    const logout = yield* send(
      new Request("http://localhost/auth/logout", {
        method: "POST",
        headers: { cookie, origin: allowedOrigin },
      }),
    )
    expect(logout.status).toBe(204)
  }).pipe(Effect.scoped),
)

it.effect("does not restrict safe methods by origin", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    const response = yield* send(
      new Request("http://localhost/health", { headers: { origin: foreignOrigin } }),
    )
    expect(response.status).toBe(200)
  }).pipe(Effect.scoped),
)
