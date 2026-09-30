import { expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { demoPassword } from "../testing/database.ts"
import { loginAs, makeTestApi } from "../testing/http.ts"

const listSellers = (cookie: string) =>
  new Request("http://localhost/sellers", { headers: { cookie } })

it.effect("lists sellers by name for a supervisor", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    const cookie = yield* loginAs(send, "demo@crm-core.dev", demoPassword)
    const response = yield* send(listSellers(cookie))
    expect(response.status).toBe(200)
    const body = yield* Effect.promise(() => response.json())
    expect(body).toMatchObject([{ name: "Ana Souza" }, { name: "Bruno Lima" }])
    expect(body).toHaveLength(2)
  }).pipe(Effect.scoped),
)

it.effect("forbids sellers from listing sellers", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    const cookie = yield* loginAs(send, "ana.souza@crm-core.dev", "seller-test-password")
    expect((yield* send(listSellers(cookie))).status).toBe(403)
  }).pipe(Effect.scoped),
)
