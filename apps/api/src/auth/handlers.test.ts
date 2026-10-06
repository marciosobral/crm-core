import { TooManyLoginAttempts } from "@crm/contract"
import { expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { TestClock } from "effect/testing"
import { demoPassword, seededEmails, sellerPassword } from "#src/testing/database.ts"
import { jsonOf, loginRequest, makeTestApi, type Send, sessionCookieOf } from "#src/testing/http.ts"

const meRequest = (cookie?: string) =>
  new Request("http://localhost/auth/me", { headers: cookie ? { cookie } : {} })

const decodeSessionRows = Schema.decodeUnknownEffect(
  Schema.Array(Schema.Struct({ id: Schema.String, expired: Schema.Boolean })),
)

it.effect("logs in with valid credentials and sets a secure session cookie", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    const response = yield* send(loginRequest("DEMO@crm-core.dev", demoPassword))
    expect(response.status).toBe(200)
    expect(yield* jsonOf(response)).toMatchObject({
      name: "Conta Demo",
      email: seededEmails.demo,
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
      loginRequest(seededEmails.demo, "wrong-password"),
      loginRequest("nobody@crm-core.dev", demoPassword),
    ]) {
      const response = yield* send(request)
      expect(response.status).toBe(401)
      expect(yield* jsonOf(response)).toEqual({ _tag: "InvalidCredentials" })
      expect(response.headers.get("set-cookie")).toBeNull()
    }
  }).pipe(Effect.scoped),
)

it.effect("rejects oversized credentials before checking them", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    for (const request of [
      loginRequest(`${"a".repeat(250)}@crm-core.dev`, demoPassword),
      loginRequest(seededEmails.demo, "a".repeat(257)),
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
    const cookie = sessionCookieOf(yield* send(loginRequest(seededEmails.demo, demoPassword)))
    const oldNameCookie = cookie.replace("__Host-crm_session=", "crm_session=")
    expect(oldNameCookie).not.toBe(cookie)
    expect((yield* send(meRequest(oldNameCookie))).status).toBe(401)
  }).pipe(Effect.scoped),
)

it.effect("returns the current user for a valid session and rejects it after logout", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    const cookie = sessionCookieOf(yield* send(loginRequest(seededEmails.demo, demoPassword)))

    const me = yield* send(meRequest(cookie))
    expect(me.status).toBe(200)
    expect(yield* jsonOf(me)).toMatchObject({ email: seededEmails.demo })

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
    const cookie = sessionCookieOf(yield* send(loginRequest(seededEmails.demo, demoPassword)))
    yield* sql`UPDATE sessions SET expires_at = now() - interval '1 second'`
    expect((yield* send(meRequest(cookie))).status).toBe(401)
  }).pipe(Effect.scoped),
)

it.effect("deletes only the logging-in user's expired sessions", () =>
  Effect.gen(function* () {
    const { send, sql } = yield* makeTestApi
    yield* send(loginRequest(seededEmails.ana, sellerPassword))
    yield* send(loginRequest(seededEmails.demo, demoPassword))
    yield* sql`UPDATE sessions SET expires_at = now() - interval '1 second'`
    const sessionsFor = (email: string) =>
      sql`
        SELECT s.id, s.expires_at < now() AS expired
        FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.email = ${email}`.pipe(
        Effect.flatMap(decodeSessionRows),
      )
    const expiredIds = yield* sessionsFor(seededEmails.demo)
    yield* send(loginRequest(seededEmails.demo, demoPassword))
    const ana = yield* sessionsFor(seededEmails.ana)
    expect(ana).toHaveLength(1)
    expect(ana[0]?.expired).toBe(true)
    const demo = yield* sessionsFor(seededEmails.demo)
    expect(demo).toHaveLength(1)
    expect(demo[0]?.expired).toBe(false)
    expect(demo[0]?.id).not.toBe(expiredIds[0]?.id)
  }).pipe(Effect.scoped),
)

const attemptLogins = (send: Send, email: string, password: string, count: number) =>
  Effect.forEach(Array.from({ length: count }), () => send(loginRequest(email, password)))

it.effect("blocks the sixth login with 429 and Retry-After, even with the right password", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    for (const response of yield* attemptLogins(send, seededEmails.demo, "wrong-password", 5))
      expect(response.status).toBe(401)
    const blocked = yield* send(loginRequest(seededEmails.demo, demoPassword))
    expect(blocked.status).toBe(429)
    const body = yield* jsonOf(blocked)
    expect(body).toMatchObject({ _tag: "TooManyLoginAttempts" })
    const { retryAfterSeconds } = Schema.decodeUnknownSync(TooManyLoginAttempts)(body)
    expect(retryAfterSeconds).toBeGreaterThanOrEqual(1)
    expect(retryAfterSeconds).toBeLessThanOrEqual(900)
    expect(blocked.headers.get("retry-after")).toBe(String(retryAfterSeconds))
    expect(blocked.headers.get("set-cookie")).toBeNull()
  }).pipe(Effect.scoped),
)

it.effect("clears the failure count after a successful login", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    yield* attemptLogins(send, seededEmails.demo, "wrong-password", 4)
    expect((yield* send(loginRequest(seededEmails.demo, demoPassword))).status).toBe(200)
    for (const response of yield* attemptLogins(send, seededEmails.demo, "wrong-password", 5))
      expect(response.status).toBe(401)
    expect((yield* send(loginRequest(seededEmails.demo, "wrong-password"))).status).toBe(429)
  }).pipe(Effect.scoped),
)

it.effect("limits unknown emails like known ones", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    for (const response of yield* attemptLogins(send, "nobody@crm-core.dev", demoPassword, 5))
      expect(response.status).toBe(401)
    expect((yield* send(loginRequest("nobody@crm-core.dev", demoPassword))).status).toBe(429)
  }).pipe(Effect.scoped),
)

it.effect("limits each account independently", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    yield* attemptLogins(send, seededEmails.demo, "wrong-password", 5)
    expect((yield* send(loginRequest(seededEmails.demo, "wrong-password"))).status).toBe(429)
    expect((yield* send(loginRequest(seededEmails.ana, "wrong-password"))).status).toBe(401)
  }).pipe(Effect.scoped),
)

const wrongPasswordsFrom = (
  send: Send,
  clientIp: string,
  count: number,
  emailOf = (index: number) => `flood-${index}@crm-core.dev`,
) =>
  Effect.forEach(Array.from({ length: count }), (_, index) =>
    send(loginRequest(emailOf(index), "wrong-password", clientIp)),
  )

const demoOf = () => seededEmails.demo
const clients = ["203.0.113.1", "203.0.113.2", "203.0.113.3", "203.0.113.4"]

it.effect("locks an account for the failing client without locking other clients", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    yield* wrongPasswordsFrom(send, "203.0.113.1", 5, demoOf)
    expect((yield* send(loginRequest(seededEmails.demo, demoPassword, "203.0.113.1"))).status).toBe(
      429,
    )
    expect((yield* send(loginRequest(seededEmails.demo, demoPassword, "203.0.113.2"))).status).toBe(
      200,
    )
  }).pipe(Effect.scoped),
)

it.effect("locks an account everywhere after 20 failures from different clients", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    for (const clientIp of clients)
      for (const response of yield* wrongPasswordsFrom(send, clientIp, 5, demoOf))
        expect(response.status).toBe(401)
    expect((yield* send(loginRequest(seededEmails.demo, demoPassword, "203.0.113.5"))).status).toBe(
      429,
    )
    expect(
      (yield* send(loginRequest(seededEmails.ana, sellerPassword, "203.0.113.5"))).status,
    ).toBe(200)
  }).pipe(Effect.scoped),
)

it.effect("keeps a known client logging in while strangers exceed the per-email limit", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    expect((yield* send(loginRequest(seededEmails.demo, demoPassword, "203.0.113.9"))).status).toBe(
      200,
    )
    for (const clientIp of clients) yield* wrongPasswordsFrom(send, clientIp, 5, demoOf)
    expect((yield* send(loginRequest(seededEmails.demo, demoPassword, "203.0.113.5"))).status).toBe(
      429,
    )
    expect((yield* send(loginRequest(seededEmails.demo, demoPassword, "203.0.113.9"))).status).toBe(
      200,
    )
  }).pipe(Effect.scoped),
)

it.effect(
  "clears the failures of that client after a successful login, keeping other clients' counts",
  () =>
    Effect.gen(function* () {
      const { send } = yield* makeTestApi
      yield* wrongPasswordsFrom(send, "203.0.113.1", 4, demoOf)
      yield* wrongPasswordsFrom(send, "203.0.113.2", 4, demoOf)
      expect(
        (yield* send(loginRequest(seededEmails.demo, demoPassword, "203.0.113.1"))).status,
      ).toBe(200)
      for (const response of yield* wrongPasswordsFrom(send, "203.0.113.1", 5, demoOf))
        expect(response.status).toBe(401)
      expect(
        (yield* send(loginRequest(seededEmails.demo, "wrong-password", "203.0.113.2"))).status,
      ).toBe(401)
      expect(
        (yield* send(loginRequest(seededEmails.demo, "wrong-password", "203.0.113.2"))).status,
      ).toBe(429)
    }).pipe(Effect.scoped),
)

it.effect("blocks the 21st login attempt from one client in a minute with 429", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    for (const response of yield* wrongPasswordsFrom(send, "203.0.113.1", 20))
      expect(response.status).toBe(401)
    const blocked = yield* send(loginRequest(seededEmails.demo, demoPassword, "203.0.113.1"))
    expect(blocked.status).toBe(429)
    expect(yield* jsonOf(blocked)).toMatchObject({ _tag: "TooManyLoginAttempts" })
    expect(blocked.headers.get("retry-after")).toBe("60")
    expect(blocked.headers.get("set-cookie")).toBeNull()
  }).pipe(Effect.scoped),
)

it.effect("rejects over-limit attempts before they reserve the email", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    yield* wrongPasswordsFrom(send, "203.0.113.1", 4, demoOf)
    yield* wrongPasswordsFrom(send, "203.0.113.1", 16)
    const blocked = yield* send(loginRequest(seededEmails.demo, "wrong-password", "203.0.113.1"))
    expect(blocked.status).toBe(429)
    yield* TestClock.adjust("1 minute")
    const fifthFailure = yield* send(
      loginRequest(seededEmails.demo, "wrong-password", "203.0.113.1"),
    )
    expect(fifthFailure.status).toBe(401)
  }).pipe(Effect.scoped),
)

it.effect("refuses parallel verifications from one client without counting them as failures", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    const unknownEmail = "nobody@crm-core.dev"
    const responses = yield* Effect.forEach(
      Array.from({ length: 4 }),
      () => send(loginRequest(unknownEmail, "wrong-password", "203.0.113.1")),
      { concurrency: "unbounded" },
    )
    const refused = responses.filter((response) => response.status === 429)
    expect(refused.length).toBeGreaterThanOrEqual(1)
    for (const response of refused) expect(response.headers.get("retry-after")).toBe("1")
    const failures = responses.length - refused.length
    expect(responses.filter((response) => response.status === 401)).toHaveLength(failures)
    for (const response of yield* Effect.forEach(Array.from({ length: 5 - failures }), () =>
      send(loginRequest(unknownEmail, "wrong-password", "203.0.113.1")),
    ))
      expect(response.status).toBe(401)
    expect((yield* send(loginRequest(unknownEmail, "wrong-password", "203.0.113.1"))).status).toBe(
      429,
    )
  }).pipe(Effect.scoped),
)

it.effect("limits each client independently and frees it after the minute", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    yield* wrongPasswordsFrom(send, "203.0.113.1", 20)
    expect((yield* send(loginRequest(seededEmails.demo, demoPassword, "203.0.113.2"))).status).toBe(
      200,
    )
    yield* TestClock.adjust("1 minute")
    expect((yield* send(loginRequest(seededEmails.demo, demoPassword, "203.0.113.1"))).status).toBe(
      200,
    )
  }).pipe(Effect.scoped),
)

it.effect("counts successful logins toward the client limit", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    for (const response of yield* Effect.forEach(Array.from({ length: 20 }), () =>
      send(loginRequest(seededEmails.demo, demoPassword, "203.0.113.1")),
    ))
      expect(response.status).toBe(200)
    expect((yield* send(loginRequest(seededEmails.demo, demoPassword, "203.0.113.1"))).status).toBe(
      429,
    )
  }).pipe(Effect.scoped),
)

it.effect("returns the role and permissions of the current user", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    const accounts = [
      {
        email: seededEmails.demo,
        password: demoPassword,
        expected: {
          role: "SUPERVISOR",
          permissions: [
            "lead.create",
            "lead.see_all",
            "lead.assign_any",
            "deal.create",
            "deal.see_all",
            "deal.assign_any",
            "deal.move",
            "deal.close",
            "deal.comment",
            "deal.suggest",
            "assistant.chat",
          ],
        },
      },
      {
        email: seededEmails.ana,
        password: sellerPassword,
        expected: {
          role: "SELLER",
          permissions: [
            "lead.create",
            "deal.create",
            "deal.move",
            "deal.close",
            "deal.comment",
            "deal.suggest",
            "assistant.chat",
          ],
        },
      },
    ]
    for (const { email, password, expected } of accounts) {
      const login = yield* send(loginRequest(email, password))
      expect(yield* jsonOf(login)).toMatchObject(expected)
      const me = yield* send(meRequest(sessionCookieOf(login)))
      expect(yield* jsonOf(me)).toMatchObject(expected)
    }
  }).pipe(Effect.scoped),
)
