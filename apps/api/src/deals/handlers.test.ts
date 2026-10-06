import { expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import type { SqlClient } from "effect/unstable/sql"
import { demoPassword } from "#src/testing/database.ts"
import { loginAs, makeTestApi } from "#src/testing/http.ts"

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

it.effect(
  "lets a supervisor keep or change the deal seller and forbids sellers from choosing",
  () =>
    Effect.gen(function* () {
      const { send, sql } = yield* makeTestApi
      const ids = yield* idsByEmail(sql)
      const demo = yield* loginAs(send, demoEmail, demoPassword)
      const ana = yield* loginAs(send, anaEmail, sellerPassword)
      const leadId = yield* createLead(send, demo, { sellerId: ids.ana })
      expect(yield* jsonOf(yield* createDeal(send, demo, { leadId }))).toMatchObject({
        seller: { name: "Ana Souza" },
      })
      expect(
        yield* jsonOf(yield* createDeal(send, demo, { leadId, sellerId: ids.bruno })),
      ).toMatchObject({ seller: { name: "Bruno Lima" } })
      const notSeller = yield* createDeal(send, demo, { leadId, sellerId: ids.demo })
      expect(notSeller.status).toBe(422)
      expect(yield* jsonOf(notSeller)).toMatchObject({ _tag: "InvalidDealSeller" })
      expect((yield* createDeal(send, ana, { leadId, sellerId: ids.ana })).status).toBe(403)
      expect(yield* jsonOf(yield* createDeal(send, ana, { leadId }))).toMatchObject({
        seller: { name: "Ana Souza" },
      })
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
    yield* sql`UPDATE deals SET status = 'WON', closed_at = now() WHERE id = ${dealId}`
    const closed = yield* moveDeal(send, ana, dealId, "NEGOTIATION")
    expect(closed.status).toBe(409)
    expect(yield* jsonOf(closed)).toMatchObject({ _tag: "DealClosed" })
  }).pipe(Effect.scoped),
)

const closeDeal = (send: Send, cookie: string | undefined, id: string, body: unknown) =>
  send(
    new Request(`http://localhost/deals/${id}/close`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }),
  )

const getDeal = (send: Send, cookie: string, id: string) =>
  send(new Request(`http://localhost/deals/${id}`, { headers: { cookie } }))

it.effect("closes a deal as won", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    const cookie = yield* loginAs(send, anaEmail, sellerPassword)
    const leadId = yield* createLead(send, cookie)
    const dealId = decodeId(yield* jsonOf(yield* createDeal(send, cookie, { leadId }))).id
    const response = yield* closeDeal(send, cookie, dealId, { result: "WON" })
    expect(response.status).toBe(200)
    const body = yield* jsonOf(response)
    expect(body).toMatchObject({ status: "WON", lostReason: null, lostNote: null })
    expect(
      Schema.decodeUnknownSync(Schema.Struct({ closedAt: Schema.String }))(body).closedAt,
    ).toBeTruthy()
  }).pipe(Effect.scoped),
)

it.effect("closes a deal as lost with a reason and requires a note for OTHER", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    const cookie = yield* loginAs(send, anaEmail, sellerPassword)
    const leadId = yield* createLead(send, cookie)
    const idOf = (response: Response) => Effect.map(jsonOf(response), (body) => decodeId(body).id)
    const first = yield* idOf(yield* createDeal(send, cookie, { leadId }))
    const second = yield* idOf(yield* createDeal(send, cookie, { leadId }))
    expect((yield* closeDeal(send, cookie, first, { result: "LOST" })).status).toBe(400)
    expect(
      (yield* closeDeal(send, cookie, first, { result: "LOST", reason: "OTHER" })).status,
    ).toBe(400)
    expect(
      (yield* closeDeal(send, cookie, first, { result: "LOST", reason: "OTHER", note: "  " }))
        .status,
    ).toBe(400)
    const lost = yield* closeDeal(send, cookie, first, { result: "LOST", reason: "PRICE" })
    expect(yield* jsonOf(lost)).toMatchObject({
      status: "LOST",
      lostReason: "PRICE",
      lostNote: null,
    })
    const other = yield* closeDeal(send, cookie, second, {
      result: "LOST",
      reason: "OTHER",
      note: "Fechou com outra rede",
    })
    expect(yield* jsonOf(other)).toMatchObject({
      lostReason: "OTHER",
      lostNote: "Fechou com outra rede",
    })
  }).pipe(Effect.scoped),
)

it.effect("keeps a closed deal final", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    const cookie = yield* loginAs(send, anaEmail, sellerPassword)
    const leadId = yield* createLead(send, cookie)
    const dealId = decodeId(yield* jsonOf(yield* createDeal(send, cookie, { leadId }))).id
    yield* closeDeal(send, cookie, dealId, { result: "WON" })
    const again = yield* closeDeal(send, cookie, dealId, { result: "LOST", reason: "PRICE" })
    expect(again.status).toBe(409)
    expect(yield* jsonOf(again)).toMatchObject({ _tag: "DealClosed" })
    expect((yield* moveDeal(send, cookie, dealId, "NEGOTIATION")).status).toBe(409)
  }).pipe(Effect.scoped),
)

it.effect("scopes closing and details to the deals the user can see", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    const ana = yield* loginAs(send, anaEmail, sellerPassword)
    const bruno = yield* loginAs(send, brunoEmail, sellerPassword)
    const demo = yield* loginAs(send, demoEmail, demoPassword)
    const leadId = yield* createLead(send, ana)
    const dealId = decodeId(yield* jsonOf(yield* createDeal(send, ana, { leadId }))).id
    expect((yield* getDeal(send, bruno, dealId)).status).toBe(404)
    expect((yield* closeDeal(send, bruno, dealId, { result: "WON" })).status).toBe(404)
    expect((yield* closeDeal(send, undefined, dealId, { result: "WON" })).status).toBe(401)
    const details = yield* getDeal(send, demo, dealId)
    expect(details.status).toBe(200)
    expect(yield* jsonOf(details)).toMatchObject({
      deal: { id: dealId, status: "NEW" },
      lead: {
        id: leadId,
        name: "Thiago Lima",
        email: "thiago@academiax.com.br",
        phone: "11983111234",
      },
    })
    expect((yield* closeDeal(send, demo, dealId, { result: "WON" })).status).toBe(200)
  }).pipe(Effect.scoped),
)

it.effect("shows the linked lead to the deal's seller even when the lead is someone else's", () =>
  Effect.gen(function* () {
    const { send, sql } = yield* makeTestApi
    const ids = yield* idsByEmail(sql)
    const demo = yield* loginAs(send, demoEmail, demoPassword)
    const bruno = yield* loginAs(send, brunoEmail, sellerPassword)
    const leadId = yield* createLead(send, demo, { sellerId: ids.ana })
    const dealId = decodeId(
      yield* jsonOf(yield* createDeal(send, demo, { leadId, sellerId: ids.bruno })),
    ).id
    const details = yield* getDeal(send, bruno, dealId)
    expect(details.status).toBe(200)
    expect(yield* jsonOf(details)).toMatchObject({
      lead: { id: leadId, seller: { name: "Ana Souza" } },
    })
  }).pipe(Effect.scoped),
)

it.effect("derives the lead status from closed deals", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    const cookie = yield* loginAs(send, anaEmail, sellerPassword)
    const leadId = yield* createLead(send, cookie)
    const dealId = decodeId(yield* jsonOf(yield* createDeal(send, cookie, { leadId }))).id
    yield* closeDeal(send, cookie, dealId, { result: "LOST", reason: "NO_BUDGET" })
    const leads = yield* jsonOf(
      yield* send(new Request("http://localhost/leads", { headers: { cookie } })),
    )
    expect(leads).toMatchObject([{ id: leadId, status: "LOST" }])
  }).pipe(Effect.scoped),
)

const listActivities = (send: Send, cookie: string | undefined, id: string) =>
  send(
    new Request(`http://localhost/deals/${id}/activities`, {
      headers: cookie ? { cookie } : {},
    }),
  )

const addComment = (send: Send, cookie: string | undefined, id: string, body: unknown) =>
  send(
    new Request(`http://localhost/deals/${id}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ body }),
    }),
  )

const decodeKinds = Schema.decodeUnknownSync(Schema.Array(Schema.Struct({ kind: Schema.String })))

it.effect("records events when a deal is created, moved and closed", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    const cookie = yield* loginAs(send, anaEmail, sellerPassword)
    const leadId = yield* createLead(send, cookie)
    const dealId = decodeId(yield* jsonOf(yield* createDeal(send, cookie, { leadId }))).id
    yield* moveDeal(send, cookie, dealId, "NEGOTIATION")
    yield* moveDeal(send, cookie, dealId, "NEGOTIATION")
    yield* closeDeal(send, cookie, dealId, { result: "LOST", reason: "PRICE" })
    const response = yield* listActivities(send, cookie, dealId)
    expect(response.status).toBe(200)
    const activities = yield* jsonOf(response)
    expect(decodeKinds(activities).map((activity) => activity.kind)).toEqual([
      "LOST",
      "STATUS_CHANGED",
      "SELLER_ASSIGNED",
      "CREATED",
    ])
    expect(activities).toMatchObject([
      { kind: "LOST", lostReason: "PRICE", author: { name: "Ana Souza" } },
      { kind: "STATUS_CHANGED", status: "NEGOTIATION" },
      { kind: "SELLER_ASSIGNED", seller: { name: "Ana Souza" } },
      { kind: "CREATED", author: { name: "Ana Souza" } },
    ])
  }).pipe(Effect.scoped),
)

it.effect("records no status change after the deal is closed", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    const cookie = yield* loginAs(send, anaEmail, sellerPassword)
    const leadId = yield* createLead(send, cookie)
    const dealId = decodeId(yield* jsonOf(yield* createDeal(send, cookie, { leadId }))).id
    yield* closeDeal(send, cookie, dealId, { result: "WON" })
    expect((yield* moveDeal(send, cookie, dealId, "CONTACTED")).status).toBe(409)
    const activities = yield* jsonOf(yield* listActivities(send, cookie, dealId))
    expect(decodeKinds(activities).map((activity) => activity.kind)).toEqual([
      "WON",
      "SELLER_ASSIGNED",
      "CREATED",
    ])
  }).pipe(Effect.scoped),
)

it.effect("attributes events to the acting user, not the deal's seller", () =>
  Effect.gen(function* () {
    const { send, sql } = yield* makeTestApi
    const ids = yield* idsByEmail(sql)
    const demo = yield* loginAs(send, demoEmail, demoPassword)
    const leadId = yield* createLead(send, demo, { sellerId: ids.ana })
    const dealId = decodeId(
      yield* jsonOf(yield* createDeal(send, demo, { leadId, sellerId: ids.ana })),
    ).id
    yield* moveDeal(send, demo, dealId, "CONTACTED")
    expect(yield* jsonOf(yield* listActivities(send, demo, dealId))).toMatchObject([
      { kind: "STATUS_CHANGED", author: { name: "Conta Demo" } },
      { kind: "SELLER_ASSIGNED", author: { name: "Conta Demo" }, seller: { name: "Ana Souza" } },
      { kind: "CREATED", author: { name: "Conta Demo" } },
    ])
  }).pipe(Effect.scoped),
)

it.effect("adds trimmed comments and lists them with the events, newest first", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    const cookie = yield* loginAs(send, anaEmail, sellerPassword)
    const leadId = yield* createLead(send, cookie)
    const dealId = decodeId(yield* jsonOf(yield* createDeal(send, cookie, { leadId }))).id
    const first = yield* addComment(send, cookie, dealId, "Cliente pediu desconto")
    expect(first.status).toBe(201)
    expect(yield* jsonOf(first)).toMatchObject({
      kind: "COMMENT",
      body: "Cliente pediu desconto",
      author: { name: "Ana Souza" },
    })
    yield* addComment(send, cookie, dealId, "  Reunião na sexta  ")
    const activities = yield* jsonOf(yield* listActivities(send, cookie, dealId))
    expect(activities).toMatchObject([
      { kind: "COMMENT", body: "Reunião na sexta" },
      { kind: "COMMENT", body: "Cliente pediu desconto" },
      { kind: "SELLER_ASSIGNED" },
      { kind: "CREATED" },
    ])
  }).pipe(Effect.scoped),
)

it.effect("rejects empty or too long comments", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    const cookie = yield* loginAs(send, anaEmail, sellerPassword)
    const leadId = yield* createLead(send, cookie)
    const dealId = decodeId(yield* jsonOf(yield* createDeal(send, cookie, { leadId }))).id
    expect((yield* addComment(send, cookie, dealId, "   ")).status).toBe(400)
    expect((yield* addComment(send, cookie, dealId, "x".repeat(2001))).status).toBe(400)
    expect((yield* addComment(send, cookie, dealId, "x".repeat(2000))).status).toBe(201)
  }).pipe(Effect.scoped),
)

it.effect("scopes comments and activities to the deals the user can see", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    const ana = yield* loginAs(send, anaEmail, sellerPassword)
    const bruno = yield* loginAs(send, brunoEmail, sellerPassword)
    const demo = yield* loginAs(send, demoEmail, demoPassword)
    const leadId = yield* createLead(send, ana)
    const dealId = decodeId(yield* jsonOf(yield* createDeal(send, ana, { leadId }))).id
    const missingId = "00000000-0000-4000-8000-000000000000"
    expect((yield* listActivities(send, bruno, dealId)).status).toBe(404)
    expect((yield* addComment(send, bruno, dealId, "Oi")).status).toBe(404)
    expect((yield* listActivities(send, ana, missingId)).status).toBe(404)
    expect((yield* addComment(send, ana, missingId, "Oi")).status).toBe(404)
    expect((yield* addComment(send, undefined, dealId, "Oi")).status).toBe(401)
    expect(
      yield* jsonOf(yield* addComment(send, demo, dealId, "Aprovado desconto extra")),
    ).toMatchObject({ author: { name: "Conta Demo" } })
    yield* closeDeal(send, ana, dealId, { result: "WON" })
    expect((yield* addComment(send, ana, dealId, "Entrega agendada")).status).toBe(201)
  }).pipe(Effect.scoped),
)

const decodeLastActivities = Schema.decodeUnknownSync(
  Schema.Array(
    Schema.Struct({
      id: Schema.String,
      lastActivity: Schema.NullOr(Schema.Struct({ at: Schema.String, authorName: Schema.String })),
    }),
  ),
)

it.effect("shows each lead's last interaction across its deals", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    const ana = yield* loginAs(send, anaEmail, sellerPassword)
    const demo = yield* loginAs(send, demoEmail, demoPassword)
    const quietLead = yield* createLead(send, ana, { name: "Sem negócio" })
    const busyLead = yield* createLead(send, ana)
    yield* createDeal(send, ana, { leadId: busyLead, title: "Primeiro" })
    const dealId = decodeId(
      yield* jsonOf(yield* createDeal(send, ana, { leadId: busyLead, title: "Segundo" })),
    ).id
    const lastActivityOf = (leadId: string) =>
      Effect.gen(function* () {
        const response = yield* send(
          new Request("http://localhost/leads", { headers: { cookie: ana } }),
        )
        const leads = decodeLastActivities(yield* jsonOf(response))
        return leads.find((lead) => lead.id === leadId)?.lastActivity
      })
    expect(yield* lastActivityOf(quietLead)).toBeNull()
    expect(yield* lastActivityOf(busyLead)).toMatchObject({ authorName: "Ana Souza" })
    yield* addComment(send, demo, dealId, "Ligar amanhã")
    expect(yield* lastActivityOf(busyLead)).toMatchObject({ authorName: "Conta Demo" })
  }).pipe(Effect.scoped),
)

it.effect("hides activity on other sellers' deals from the lead's last interaction", () =>
  Effect.gen(function* () {
    const { send, sql } = yield* makeTestApi
    const ids = yield* idsByEmail(sql)
    const demo = yield* loginAs(send, demoEmail, demoPassword)
    const ana = yield* loginAs(send, anaEmail, sellerPassword)
    const bruno = yield* loginAs(send, brunoEmail, sellerPassword)
    const leadId = yield* createLead(send, demo, { sellerId: ids.ana })
    const dealId = decodeId(
      yield* jsonOf(yield* createDeal(send, demo, { leadId, sellerId: ids.bruno })),
    ).id
    yield* addComment(send, demo, dealId, "Ligar amanhã")
    const lastActivityOf = (cookie: string) =>
      Effect.gen(function* () {
        const response = yield* send(new Request("http://localhost/leads", { headers: { cookie } }))
        return decodeLastActivities(yield* jsonOf(response)).find((lead) => lead.id === leadId)
          ?.lastActivity
      })
    expect(yield* lastActivityOf(ana)).toBeNull()
    expect(yield* lastActivityOf(demo)).toMatchObject({ authorName: "Conta Demo" })
    expect(yield* jsonOf(yield* getDeal(send, bruno, dealId))).toMatchObject({
      lead: { lastActivity: { authorName: "Conta Demo" } },
    })
  }).pipe(Effect.scoped),
)
