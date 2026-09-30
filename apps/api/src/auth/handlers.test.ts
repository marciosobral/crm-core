import { expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { demoPassword } from "../testing/database.ts"
import { makeTestApi } from "../testing/http.ts"

const loginRequest = (email: string, password: string) =>
  new Request("http://localhost/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  })

const meRequest = (cookie?: string) =>
  new Request("http://localhost/auth/me", { headers: cookie ? { cookie } : {} })

const sessionCookieOf = (response: Response) =>
  response.headers.get("set-cookie")?.split(";")[0] ?? ""

it.effect("logs in with valid credentials and sets a secure session cookie", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    const response = yield* send(loginRequest("DEMO@crm-core.dev", demoPassword))
    expect(response.status).toBe(200)
    expect(yield* Effect.promise(() => response.json())).toMatchObject({
      name: "Conta Demo",
      email: "demo@crm-core.dev",
    })
    const setCookie = response.headers.get("set-cookie") ?? ""
    expect(setCookie).toMatch(/^__Host-crm_session=[\w-]{43};/)
    expect(setCookie).toContain("HttpOnly")
    expect(setCookie).toContain("Secure")
    expect(setCookie).toContain("SameSite=Lax")
    expect(setCookie).toContain("Max-Age=604800")
  }).pipe(Effect.scoped),
)

it.effect("rejects a wrong password and an unknown email the same way", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    for (const request of [
      loginRequest("demo@crm-core.dev", "wrong-password"),
      loginRequest("nobody@crm-core.dev", demoPassword),
    ]) {
      const response = yield* send(request)
      expect(response.status).toBe(401)
      expect(yield* Effect.promise(() => response.json())).toEqual({ _tag: "InvalidCredentials" })
      expect(response.headers.get("set-cookie")).toBeNull()
    }
  }).pipe(Effect.scoped),
)

it.effect("rejects oversized credentials before checking them", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    for (const request of [
      loginRequest(`${"a".repeat(250)}@crm-core.dev`, demoPassword),
      loginRequest("demo@crm-core.dev", "a".repeat(257)),
    ]) {
      expect((yield* send(request)).status).toBe(400)
    }
  }).pipe(Effect.scoped),
)

it.effect("rejects the current-user endpoint without a session", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    expect((yield* send(meRequest())).status).toBe(401)
    expect((yield* send(meRequest("__Host-crm_session=forged"))).status).toBe(401)
  }).pipe(Effect.scoped),
)

it.effect("ignores a session cookie under the old unprefixed name", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    const cookie = sessionCookieOf(yield* send(loginRequest("demo@crm-core.dev", demoPassword)))
    const oldNameCookie = cookie.replace("__Host-crm_session=", "crm_session=")
    expect(oldNameCookie).not.toBe(cookie)
    expect((yield* send(meRequest(oldNameCookie))).status).toBe(401)
  }).pipe(Effect.scoped),
)

it.effect("returns the current user for a valid session and rejects it after logout", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    const cookie = sessionCookieOf(yield* send(loginRequest("demo@crm-core.dev", demoPassword)))

    const me = yield* send(meRequest(cookie))
    expect(me.status).toBe(200)
    expect(yield* Effect.promise(() => me.json())).toMatchObject({ email: "demo@crm-core.dev" })

    const logout = yield* send(
      new Request("http://localhost/auth/logout", { method: "POST", headers: { cookie } }),
    )
    expect(logout.status).toBe(204)
    const clearingCookie = logout.headers.get("set-cookie")
    expect(clearingCookie).toMatch(/^__Host-crm_session=;.*Max-Age=0/)
    expect(clearingCookie).toContain("Secure")
    expect(clearingCookie).toContain("Path=/")
    expect((yield* send(meRequest(cookie))).status).toBe(401)
  }).pipe(Effect.scoped),
)

it.effect("rejects an expired session", () =>
  Effect.gen(function* () {
    const { send, sql } = yield* makeTestApi
    const cookie = sessionCookieOf(yield* send(loginRequest("demo@crm-core.dev", demoPassword)))
    yield* sql`UPDATE sessions SET expires_at = now() - interval '1 second'`
    expect((yield* send(meRequest(cookie))).status).toBe(401)
  }).pipe(Effect.scoped),
)

it.effect("deletes only the logging-in user's expired sessions", () =>
  Effect.gen(function* () {
    const { send, sql } = yield* makeTestApi
    yield* send(loginRequest("ana.souza@crm-core.dev", "seller-test-password"))
    yield* send(loginRequest("demo@crm-core.dev", demoPassword))
    yield* sql`UPDATE sessions SET expires_at = now() - interval '1 second'`
    const expiredIds = yield* sql<{ id: string }>`
      SELECT s.id FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.email = 'demo@crm-core.dev'`
    yield* send(loginRequest("demo@crm-core.dev", demoPassword))
    const countFor = (email: string) =>
      sql<{ id: string; expired: boolean }>`
        SELECT s.id, s.expires_at < now() AS expired
        FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.email = ${email}`
    const ana = yield* countFor("ana.souza@crm-core.dev")
    expect(ana).toHaveLength(1)
    expect(ana[0]?.expired).toBe(true)
    const demo = yield* countFor("demo@crm-core.dev")
    expect(demo).toHaveLength(1)
    expect(demo[0]?.expired).toBe(false)
    expect(demo[0]?.id).not.toBe(expiredIds[0]?.id)
  }).pipe(Effect.scoped),
)
