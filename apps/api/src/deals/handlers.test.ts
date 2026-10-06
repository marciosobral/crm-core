import { expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { TestClock } from "effect/testing"
import { aiUsageRows } from "#src/testing/ai-usage.ts"
import { demoPassword, seededEmails, seededUserIds, sellerPassword } from "#src/testing/database.ts"
import { decodeId } from "#src/testing/fixtures.ts"
import {
  jsonOf,
  jsonRequest,
  loginAs,
  makeTestApi,
  makeTestApiWith,
  type Send,
} from "#src/testing/http.ts"
import {
  failingModel,
  fakeLanguageModel,
  type PromptMessages,
  promptText,
} from "#src/testing/language-model.ts"

const decodeTitles = Schema.decodeUnknownSync(Schema.Array(Schema.Struct({ title: Schema.String })))

const createLead = (send: Send, cookie: string, overrides: Record<string, unknown> = {}) =>
  Effect.gen(function* () {
    const response = yield* send(
      jsonRequest(
        "POST",
        "/leads",
        {
          name: "Thiago Lima",
          company: "Academia X",
          email: "thiago@academiax.com.br",
          phone: "11983111234",
          source: "REFERRAL",
          ...overrides,
        },
        cookie,
      ),
    )
    return decodeId(yield* jsonOf(response)).id
  })

const createDeal = (send: Send, cookie: string, body: Record<string, unknown>) =>
  send(
    jsonRequest(
      "POST",
      "/deals",
      { title: "Academia X - Kit Completo", valueCents: 8_900_000, status: "NEW", ...body },
      cookie,
    ),
  )

const moveDeal = (send: Send, cookie: string | undefined, id: string, status: string) =>
  send(jsonRequest("PATCH", `/deals/${id}/status`, { status }, cookie))

const listDeals = (send: Send, cookie: string, query = "") =>
  send(new Request(`http://localhost/deals${query}`, { headers: { cookie } }))

it.effect("lets a seller create a deal on their own lead, owned by themselves", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    const cookie = yield* loginAs(send, seededEmails.ana, sellerPassword)
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
    const bruno = yield* loginAs(send, seededEmails.bruno, sellerPassword)
    const brunoLeadId = yield* createLead(send, bruno)
    const ana = yield* loginAs(send, seededEmails.ana, sellerPassword)
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
      const ids = yield* seededUserIds(sql)
      const demo = yield* loginAs(send, seededEmails.demo, demoPassword)
      const ana = yield* loginAs(send, seededEmails.ana, sellerPassword)
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
    const cookie = yield* loginAs(send, seededEmails.ana, sellerPassword)
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
    const ids = yield* seededUserIds(sql)
    const ana = yield* loginAs(send, seededEmails.ana, sellerPassword)
    const bruno = yield* loginAs(send, seededEmails.bruno, sellerPassword)
    const demo = yield* loginAs(send, seededEmails.demo, demoPassword)
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
    const cookie = yield* loginAs(send, seededEmails.ana, sellerPassword)
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
    const ana = yield* loginAs(send, seededEmails.ana, sellerPassword)
    const bruno = yield* loginAs(send, seededEmails.bruno, sellerPassword)
    const demo = yield* loginAs(send, seededEmails.demo, demoPassword)
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
  send(jsonRequest("POST", `/deals/${id}/close`, body, cookie))

const getDeal = (send: Send, cookie: string, id: string) =>
  send(new Request(`http://localhost/deals/${id}`, { headers: { cookie } }))

it.effect("closes a deal as won", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    const cookie = yield* loginAs(send, seededEmails.ana, sellerPassword)
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
    const cookie = yield* loginAs(send, seededEmails.ana, sellerPassword)
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
    const cookie = yield* loginAs(send, seededEmails.ana, sellerPassword)
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
    const ana = yield* loginAs(send, seededEmails.ana, sellerPassword)
    const bruno = yield* loginAs(send, seededEmails.bruno, sellerPassword)
    const demo = yield* loginAs(send, seededEmails.demo, demoPassword)
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
    const ids = yield* seededUserIds(sql)
    const demo = yield* loginAs(send, seededEmails.demo, demoPassword)
    const bruno = yield* loginAs(send, seededEmails.bruno, sellerPassword)
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
    const cookie = yield* loginAs(send, seededEmails.ana, sellerPassword)
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
  send(jsonRequest("POST", `/deals/${id}/comments`, { body }, cookie))

const decodeKinds = Schema.decodeUnknownSync(Schema.Array(Schema.Struct({ kind: Schema.String })))

it.effect("records events when a deal is created, moved and closed", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    const cookie = yield* loginAs(send, seededEmails.ana, sellerPassword)
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
    const cookie = yield* loginAs(send, seededEmails.ana, sellerPassword)
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
    const ids = yield* seededUserIds(sql)
    const demo = yield* loginAs(send, seededEmails.demo, demoPassword)
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
    const cookie = yield* loginAs(send, seededEmails.ana, sellerPassword)
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
    const cookie = yield* loginAs(send, seededEmails.ana, sellerPassword)
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
    const ana = yield* loginAs(send, seededEmails.ana, sellerPassword)
    const bruno = yield* loginAs(send, seededEmails.bruno, sellerPassword)
    const demo = yield* loginAs(send, seededEmails.demo, demoPassword)
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
    const ana = yield* loginAs(send, seededEmails.ana, sellerPassword)
    const demo = yield* loginAs(send, seededEmails.demo, demoPassword)
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
    const ids = yield* seededUserIds(sql)
    const demo = yield* loginAs(send, seededEmails.demo, demoPassword)
    const ana = yield* loginAs(send, seededEmails.ana, sellerPassword)
    const bruno = yield* loginAs(send, seededEmails.bruno, sellerPassword)
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

const nextStepReply = JSON.stringify({
  action: "  Ligar para confirmar o desconto à vista  ",
  reason: "O cliente pediu desconto no pagamento à vista.",
})

const suggestNextStep = (send: Send, cookie: string, id: string) =>
  send(
    new Request(`http://localhost/deals/${id}/next-step`, { method: "POST", headers: { cookie } }),
  )

it.effect("suggests the next step from the deal and its timeline", () =>
  Effect.gen(function* () {
    const prompts: Array<PromptMessages> = []
    const { send, sql } = yield* makeTestApiWith(
      fakeLanguageModel(Effect.succeed(nextStepReply), prompts, {
        input: 500,
        cachedInput: 0,
        output: 40,
        reasoning: 12,
      }),
    )
    const cookie = yield* loginAs(send, seededEmails.ana, sellerPassword)
    const leadId = yield* createLead(send, cookie)
    const dealId = decodeId(yield* jsonOf(yield* createDeal(send, cookie, { leadId }))).id
    yield* addComment(send, cookie, dealId, "Cliente pediu desconto à vista")
    const response = yield* suggestNextStep(send, cookie, dealId)
    expect(response.status).toBe(200)
    expect(yield* jsonOf(response)).toEqual({
      action: "Ligar para confirmar o desconto à vista",
      reason: "O cliente pediu desconto no pagamento à vista.",
    })
    expect(prompts).toHaveLength(1)
    const prompt = promptText(prompts[0] ?? [])
    expect(prompt).toContain("Academia X - Kit Completo")
    expect(prompt).toContain("Cliente pediu desconto à vista")
    expect(prompt).not.toContain("thiago@academiax.com.br")
    expect(prompt).not.toContain("11983111234")
    const ids = yield* seededUserIds(sql)
    const rows = yield* aiUsageRows(sql)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      userId: ids.ana,
      dealId,
      feature: "NEXT_STEP",
      provider: "openai",
      model: "gpt-6-luna",
      reasoningEffort: "low",
      outcome: "SUCCEEDED",
      inputTokens: 500,
      cachedInputTokens: 0,
      outputTokens: 40,
      reasoningTokens: 12,
    })
    expect(rows[0]?.durationMs).toBeGreaterThanOrEqual(0)
  }).pipe(Effect.scoped),
)

it.effect("suggests next steps only on open deals the user can see", () =>
  Effect.gen(function* () {
    const prompts: Array<PromptMessages> = []
    const { send, sql } = yield* makeTestApiWith(
      fakeLanguageModel(Effect.succeed(nextStepReply), prompts),
    )
    const ana = yield* loginAs(send, seededEmails.ana, sellerPassword)
    const bruno = yield* loginAs(send, seededEmails.bruno, sellerPassword)
    const leadId = yield* createLead(send, ana)
    const dealId = decodeId(yield* jsonOf(yield* createDeal(send, ana, { leadId }))).id
    expect((yield* suggestNextStep(send, bruno, dealId)).status).toBe(404)
    expect((yield* suggestNextStep(send, ana, crypto.randomUUID())).status).toBe(404)
    yield* sql`UPDATE deals SET status = 'WON', closed_at = now() WHERE id = ${dealId}`
    const closed = yield* suggestNextStep(send, ana, dealId)
    expect(closed.status).toBe(409)
    expect(yield* jsonOf(closed)).toMatchObject({ _tag: "DealClosed" })
    expect(prompts).toHaveLength(0)
    expect(yield* aiUsageRows(sql)).toHaveLength(0)
  }).pipe(Effect.scoped),
)

it.effect("answers 503 when the assistant fails or has no key", () =>
  Effect.gen(function* () {
    for (const api of [makeTestApi, makeTestApiWith(failingModel)]) {
      const { send, sql } = yield* api
      const cookie = yield* loginAs(send, seededEmails.ana, sellerPassword)
      const leadId = yield* createLead(send, cookie)
      const dealId = decodeId(yield* jsonOf(yield* createDeal(send, cookie, { leadId }))).id
      const response = yield* suggestNextStep(send, cookie, dealId)
      expect(response.status).toBe(503)
      expect(yield* jsonOf(response)).toMatchObject({ _tag: "AssistantUnavailable" })
      const rows = yield* aiUsageRows(sql)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        outcome: "FAILED",
        inputTokens: null,
        cachedInputTokens: null,
        outputTokens: null,
        reasoningTokens: null,
      })
    }
  }).pipe(Effect.scoped),
)

it.effect("limits suggestions to five per user per minute", () =>
  Effect.gen(function* () {
    const { send, sql } = yield* makeTestApiWith(fakeLanguageModel(Effect.succeed(nextStepReply)))
    const ana = yield* loginAs(send, seededEmails.ana, sellerPassword)
    const demo = yield* loginAs(send, seededEmails.demo, demoPassword)
    const leadId = yield* createLead(send, ana)
    const dealId = decodeId(yield* jsonOf(yield* createDeal(send, ana, { leadId }))).id
    for (let call = 0; call < 5; call++)
      expect((yield* suggestNextStep(send, ana, dealId)).status).toBe(200)
    const limited = yield* suggestNextStep(send, ana, dealId)
    expect(limited.status).toBe(429)
    expect(yield* aiUsageRows(sql)).toHaveLength(5)
    const body = Schema.decodeUnknownSync(
      Schema.Struct({
        _tag: Schema.Literal("AssistantRateLimited"),
        retryAfterSeconds: Schema.Int,
      }),
    )(yield* jsonOf(limited))
    expect(body.retryAfterSeconds).toBeGreaterThan(0)
    expect((yield* suggestNextStep(send, demo, dealId)).status).toBe(200)
  }).pipe(Effect.scoped),
)

const titlesOf = (send: Send, cookie: string, query: string) =>
  Effect.gen(function* () {
    const response = yield* listDeals(send, cookie, query)
    expect(response.status).toBe(200)
    return decodeTitles(yield* jsonOf(response))
      .map((deal) => deal.title)
      .sort()
  })

const seedFilterDeals = (send: Send, cookie: string) =>
  Effect.gen(function* () {
    const leadId = yield* createLead(send, cookie)
    const create = (body: Record<string, unknown>) =>
      createDeal(send, cookie, { leadId, ...body }).pipe(
        Effect.flatMap((response) => jsonOf(response)),
        Effect.map((created) => decodeId(created).id),
      )
    return {
      small: yield* create({ title: "Small", valueCents: 100_000, status: "NEW" }),
      medium: yield* create({
        title: "Medium",
        valueCents: 500_000,
        status: "NEGOTIATION",
        expectedCloseDate: "2026-11-10",
      }),
      large: yield* create({
        title: "Large",
        valueCents: 900_000,
        status: "PROPOSAL_SENT",
        expectedCloseDate: "2026-12-20",
      }),
    }
  })

it.effect("filters deals by status, value range and expected close date", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    const ana = yield* loginAs(send, seededEmails.ana, sellerPassword)
    yield* seedFilterDeals(send, ana)
    expect(yield* titlesOf(send, ana, "?statuses=NEGOTIATION,PROPOSAL_SENT")).toEqual([
      "Large",
      "Medium",
    ])
    expect(yield* titlesOf(send, ana, "?statuses=NEW")).toEqual(["Small"])
    expect(yield* titlesOf(send, ana, "?minValueCents=500000")).toEqual(["Large", "Medium"])
    expect(yield* titlesOf(send, ana, "?maxValueCents=500000")).toEqual(["Medium", "Small"])
    expect(yield* titlesOf(send, ana, "?closeFrom=2026-11-10&closeTo=2026-11-10")).toEqual([
      "Medium",
    ])
    expect(yield* titlesOf(send, ana, "?closeFrom=2026-12-01")).toEqual(["Large"])
    expect(yield* titlesOf(send, ana, "?closeTo=2026-11-30")).toEqual(["Medium"])
  }).pipe(Effect.scoped),
)

it.effect("combines filters with and", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    const ana = yield* loginAs(send, seededEmails.ana, sellerPassword)
    yield* seedFilterDeals(send, ana)
    expect(
      yield* titlesOf(
        send,
        ana,
        "?statuses=NEGOTIATION,PROPOSAL_SENT&minValueCents=600000&closeTo=2026-12-31&search=large",
      ),
    ).toEqual(["Large"])
    expect(yield* titlesOf(send, ana, "?statuses=NEW&minValueCents=600000")).toEqual([])
  }).pipe(Effect.scoped),
)

it.effect("filters deals by days without interaction, counting comments", () =>
  Effect.gen(function* () {
    // Idle days compare against the API clock, while the seeded activity uses the database clock.
    yield* TestClock.setTime(Date.now())
    const { send, sql } = yield* makeTestApi
    const ana = yield* loginAs(send, seededEmails.ana, sellerPassword)
    const { medium } = yield* seedFilterDeals(send, ana)
    expect(yield* titlesOf(send, ana, "?idleDays=5")).toEqual([])
    yield* sql`UPDATE deal_events SET created_at = now() - interval '10 days' WHERE deal_id = ${medium}`
    expect(yield* titlesOf(send, ana, "?idleDays=5")).toEqual(["Medium"])
    expect(yield* titlesOf(send, ana, "?idleDays=11")).toEqual([])
    yield* addComment(send, ana, medium, "Retomei o contato")
    expect(yield* titlesOf(send, ana, "?idleDays=5")).toEqual([])
    yield* sql`UPDATE deal_comments SET created_at = now() - interval '10 days' WHERE deal_id = ${medium}`
    expect(yield* titlesOf(send, ana, "?idleDays=5")).toEqual(["Medium"])
  }).pipe(Effect.scoped),
)

it.effect("counts idle days as Sao Paulo calendar days", () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(Date.parse("2026-10-06T13:00:00Z"))
    const { send, sql } = yield* makeTestApi
    const ana = yield* loginAs(send, seededEmails.ana, sellerPassword)
    const { medium } = yield* seedFilterDeals(send, ana)
    const lastActivityAt = (timestamp: string) =>
      sql`UPDATE deal_events SET created_at = ${timestamp}::timestamptz WHERE deal_id = ${medium}`
    yield* lastActivityAt("2026-10-01T23:00:00-03:00")
    expect(yield* titlesOf(send, ana, "?idleDays=5&statuses=NEGOTIATION")).toEqual(["Medium"])
    yield* lastActivityAt("2026-10-02T00:30:00-03:00")
    expect(yield* titlesOf(send, ana, "?idleDays=5&statuses=NEGOTIATION")).toEqual([])
  }).pipe(Effect.scoped),
)

it.effect("filters deals by the day they were closed in the Sao Paulo time zone", () =>
  Effect.gen(function* () {
    const { send, sql } = yield* makeTestApi
    const ana = yield* loginAs(send, seededEmails.ana, sellerPassword)
    const { small, medium } = yield* seedFilterDeals(send, ana)
    yield* closeDeal(send, ana, small, { result: "WON" })
    yield* closeDeal(send, ana, medium, { result: "LOST", reason: "PRICE" })
    yield* sql`UPDATE deals SET closed_at = '2026-03-10T12:00:00Z' WHERE id = ${small}`
    yield* sql`UPDATE deals SET closed_at = '2026-03-11T01:00:00Z' WHERE id = ${medium}`
    expect(yield* titlesOf(send, ana, "?closedFrom=2026-03-10&closedTo=2026-03-10")).toEqual([
      "Medium",
      "Small",
    ])
    expect(yield* titlesOf(send, ana, "?closedFrom=2026-03-11")).toEqual([])
    expect(yield* titlesOf(send, ana, "?closedTo=2026-03-09")).toEqual([])
    expect(yield* titlesOf(send, ana, "?closedFrom=2026-03-10&statuses=LOST")).toEqual(["Medium"])
  }).pipe(Effect.scoped),
)

it.effect("keeps the seller scope when filters name another seller", () =>
  Effect.gen(function* () {
    const { send, sql } = yield* makeTestApi
    const ids = yield* seededUserIds(sql)
    const ana = yield* loginAs(send, seededEmails.ana, sellerPassword)
    const bruno = yield* loginAs(send, seededEmails.bruno, sellerPassword)
    yield* seedFilterDeals(send, ana)
    expect(yield* titlesOf(send, bruno, `?sellerId=${ids.ana}&minValueCents=1`)).toEqual([])
    expect(yield* titlesOf(send, bruno, "?statuses=NEW,NEGOTIATION,PROPOSAL_SENT")).toEqual([])
    expect(yield* titlesOf(send, ana, `?sellerId=${ids.ana}&statuses=NEW`)).toEqual(["Small"])
  }).pipe(Effect.scoped),
)

it.effect("rejects an unknown status, an inverted range and an impossible date", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    const ana = yield* loginAs(send, seededEmails.ana, sellerPassword)
    for (const query of [
      "?statuses=FOO",
      "?statuses=NEW,NEW",
      "?statuses=",
      "?minValueCents=10&maxValueCents=5",
      "?closeFrom=2026-12-02&closeTo=2026-12-01",
      "?closedFrom=2026-12-02&closedTo=2026-12-01",
      "?closeFrom=2026-02-30",
      "?idleDays=0",
      "?idleDays=366",
      "?minValueCents=-1",
      "?maxValueCents=",
      "?minValueCents=0x10",
      "?minValueCents=1e3",
      "?minValueCents=100000000000",
    ]) {
      expect((yield* listDeals(send, ana, query)).status).toBe(400)
    }
  }).pipe(Effect.scoped),
)
