import { expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import type { SqlClient } from "effect/unstable/sql"
import { demoPassword } from "../testing/database.ts"
import { loginAs, makeTestApi } from "../testing/http.ts"

const sellerPassword = "seller-test-password"
const demoEmail = "demo@crm-core.dev"
const anaEmail = "ana.souza@crm-core.dev"
const brunoEmail = "bruno.lima@crm-core.dev"

type Send = (request: Request) => Effect.Effect<Response>

const jsonOf = (response: Response) => Effect.promise(() => response.json())

const decodeUsers = Schema.decodeUnknownEffect(
  Schema.Array(Schema.Struct({ id: Schema.String, email: Schema.String })),
)
const decodeId = Schema.decodeUnknownSync(Schema.Struct({ id: Schema.String }))
const decodeTitles = Schema.decodeUnknownSync(Schema.Array(Schema.Struct({ title: Schema.String })))

const idsByEmail = (sql: SqlClient.SqlClient) =>
  Effect.gen(function* () {
    const users = yield* decodeUsers(yield* sql`SELECT id, email FROM users`).pipe(Effect.orDie)
    const idOf = (email: string) => users.find((user) => user.email === email)?.id ?? ""
    return { ana: idOf(anaEmail), bruno: idOf(brunoEmail), demo: idOf(demoEmail) }
  })

const post = (send: Send, path: string, cookie: string, body: unknown) =>
  send(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(body),
    }),
  )

const createLead = (send: Send, cookie: string, overrides: Record<string, unknown> = {}) =>
  Effect.gen(function* () {
    const response = yield* post(send, "/leads", cookie, {
      name: "Thiago Lima",
      company: "Academia X",
      email: "thiago@academiax.com.br",
      phone: "11983111234",
      source: "REFERRAL",
      ...overrides,
    })
    return decodeId(yield* jsonOf(response)).id
  })

const createDeal = (send: Send, cookie: string, body: Record<string, unknown>) =>
  post(send, "/deals", cookie, {
    title: "Academia X - Kit Completo",
    valueCents: 8_900_000,
    status: "NEW",
    ...body,
  })

const moveDeal = (send: Send, cookie: string | undefined, id: string, status: string) =>
  send(
    new Request(`http://localhost/deals/${id}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ status }),
    }),
  )

const listDeals = (send: Send, cookie: string, query = "") =>
  send(new Request(`http://localhost/deals${query}`, { headers: { cookie } }))

it.effect("lets a seller create a deal on their own lead, owned by themselves", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    const cookie = yield* loginAs(send, anaEmail, sellerPassword)
    const leadId = yield* createLead(send, cookie)
    const response = yield* createDeal(send, cookie, {
      leadId,
      expectedCloseDate: "2026-10-28",
      description: "Esteiras e bikes",
    })
    expect(response.status).toBe(201)
    expect(yield* jsonOf(response)).toMatchObject({
      title: "Academia X - Kit Completo",
      valueCents: 8_900_000,
      status: "NEW",
      expectedCloseDate: "2026-10-28",
      description: "Esteiras e bikes",
      lead: { id: leadId, name: "Thiago Lima", company: "Academia X" },
      seller: { name: "Ana Souza" },
    })
  }).pipe(Effect.scoped),
)

it.effect("rejects a deal on another seller's lead or on an unknown lead", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    const bruno = yield* loginAs(send, brunoEmail, sellerPassword)
    const brunoLeadId = yield* createLead(send, bruno)
    const ana = yield* loginAs(send, anaEmail, sellerPassword)
    const otherLead = yield* createDeal(send, ana, { leadId: brunoLeadId })
    expect(otherLead.status).toBe(422)
    expect(yield* jsonOf(otherLead)).toMatchObject({ _tag: "InvalidDealLead" })
    const unknown = yield* createDeal(send, ana, { leadId: "00000000-0000-4000-8000-000000000000" })
    expect(unknown.status).toBe(422)
  }).pipe(Effect.scoped),
)

it.effect("gives the deal the lead's seller and ignores a sent sellerId", () =>
  Effect.gen(function* () {
    const { send, sql } = yield* makeTestApi
    const ids = yield* idsByEmail(sql)
    const demo = yield* loginAs(send, demoEmail, demoPassword)
    const ana = yield* loginAs(send, anaEmail, sellerPassword)
    const anaLeadId = yield* createLead(send, demo, { sellerId: ids.ana })
    const bySupervisor = yield* createDeal(send, demo, { leadId: anaLeadId, sellerId: ids.bruno })
    expect(bySupervisor.status).toBe(201)
    expect(yield* jsonOf(bySupervisor)).toMatchObject({ seller: { name: "Ana Souza" } })
    const ownLeadId = yield* createLead(send, ana)
    const bySeller = yield* createDeal(send, ana, { leadId: ownLeadId, sellerId: ids.bruno })
    expect(bySeller.status).toBe(201)
    expect(yield* jsonOf(bySeller)).toMatchObject({ seller: { name: "Ana Souza" } })
  }).pipe(Effect.scoped),
)

it.effect("rejects invalid deal payloads", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    const cookie = yield* loginAs(send, anaEmail, sellerPassword)
    const leadId = yield* createLead(send, cookie)
    expect((yield* createDeal(send, cookie, { leadId, valueCents: 0 })).status).toBe(400)
    expect((yield* createDeal(send, cookie, { leadId, valueCents: 10.5 })).status).toBe(400)
    expect((yield* createDeal(send, cookie, { leadId, status: "WON" })).status).toBe(400)
    expect((yield* createDeal(send, cookie, { leadId, title: "  " })).status).toBe(400)
    expect(
      (yield* createDeal(send, cookie, { leadId, expectedCloseDate: "2026-02-30" })).status,
    ).toBe(400)
  }).pipe(Effect.scoped),
)

it.effect("scopes the deal list by seller and searches title and lead", () =>
  Effect.gen(function* () {
    const { send, sql } = yield* makeTestApi
    const ids = yield* idsByEmail(sql)
    const ana = yield* loginAs(send, anaEmail, sellerPassword)
    const bruno = yield* loginAs(send, brunoEmail, sellerPassword)
    const demo = yield* loginAs(send, demoEmail, demoPassword)
    const anaLead = yield* createLead(send, ana)
    const brunoLead = yield* createLead(send, bruno, {
      name: "Patrícia Souza",
      company: "Hotel Marriott",
      email: "patricia@marriott.com",
    })
    yield* createDeal(send, ana, { leadId: anaLead, title: "Kit Completo" })
    yield* createDeal(send, bruno, { leadId: brunoLead, title: "Reforma da academia" })

    const titles = (response: Response) =>
      Effect.map(jsonOf(response), (body) => decodeTitles(body).map((deal) => deal.title))
    expect(yield* titles(yield* listDeals(send, ana))).toEqual(["Kit Completo"])
    expect(yield* titles(yield* listDeals(send, ana, `?sellerId=${ids.bruno}`))).toEqual([])
    expect(yield* titles(yield* listDeals(send, demo))).toEqual([
      "Reforma da academia",
      "Kit Completo",
    ])
    expect(yield* titles(yield* listDeals(send, demo, `?sellerId=${ids.ana}`))).toEqual([
      "Kit Completo",
    ])
    expect(yield* titles(yield* listDeals(send, demo, "?search=marriott"))).toEqual([
      "Reforma da academia",
    ])
    expect(yield* titles(yield* listDeals(send, demo, "?search=kit"))).toEqual(["Kit Completo"])
    expect(yield* titles(yield* listDeals(send, demo, "?search=patr"))).toEqual([
      "Reforma da academia",
    ])
  }).pipe(Effect.scoped),
)

it.effect("moves a deal between open statuses, forward and back", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    const cookie = yield* loginAs(send, anaEmail, sellerPassword)
    const leadId = yield* createLead(send, cookie)
    const dealId = decodeId(yield* jsonOf(yield* createDeal(send, cookie, { leadId }))).id
    const forward = yield* moveDeal(send, cookie, dealId, "NEGOTIATION")
    expect(forward.status).toBe(200)
    expect(yield* jsonOf(forward)).toMatchObject({ id: dealId, status: "NEGOTIATION" })
    const back = yield* moveDeal(send, cookie, dealId, "CONTACTED")
    expect(yield* jsonOf(back)).toMatchObject({ status: "CONTACTED" })
    expect((yield* moveDeal(send, cookie, dealId, "WON")).status).toBe(400)
  }).pipe(Effect.scoped),
)

it.effect("hides other sellers' deals and refuses to move closed deals", () =>
  Effect.gen(function* () {
    const { send, sql } = yield* makeTestApi
    const ana = yield* loginAs(send, anaEmail, sellerPassword)
    const bruno = yield* loginAs(send, brunoEmail, sellerPassword)
    const demo = yield* loginAs(send, demoEmail, demoPassword)
    const leadId = yield* createLead(send, ana)
    const dealId = decodeId(yield* jsonOf(yield* createDeal(send, ana, { leadId }))).id
    expect((yield* moveDeal(send, bruno, dealId, "CONTACTED")).status).toBe(404)
    expect((yield* moveDeal(send, demo, dealId, "CONTACTED")).status).toBe(200)
    expect((yield* moveDeal(send, undefined, dealId, "CONTACTED")).status).toBe(401)
    yield* sql`UPDATE deals SET status = 'WON' WHERE id = ${dealId}`
    const closed = yield* moveDeal(send, ana, dealId, "NEGOTIATION")
    expect(closed.status).toBe(409)
    expect(yield* jsonOf(closed)).toMatchObject({ _tag: "DealClosed" })
  }).pipe(Effect.scoped),
)
