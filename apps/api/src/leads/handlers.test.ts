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

const createLead = (send: Send, cookie: string, overrides: Record<string, unknown> = {}) =>
  send(
    new Request("http://localhost/leads", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        name: "Juliana Mendes",
        company: "Condomínio Reserva",
        email: "juliana@horizon.com.br",
        phone: "11973214455",
        source: "REFERRAL",
        ...overrides,
      }),
    }),
  )

const listLeads = (send: Send, cookie?: string, query = "") =>
  send(new Request(`http://localhost/leads${query}`, { headers: cookie ? { cookie } : {} }))

const jsonOf = (response: Response) => Effect.promise(() => response.json())

const decodeUsers = Schema.decodeUnknownEffect(
  Schema.Array(Schema.Struct({ id: Schema.String, email: Schema.String })),
)
const decodeLeadRows = Schema.decodeUnknownEffect(
  Schema.Array(Schema.Struct({ seller_id: Schema.String, created_by: Schema.String })),
)

const idsByEmail = (sql: SqlClient.SqlClient) =>
  Effect.gen(function* () {
    const users = yield* decodeUsers(yield* sql`SELECT id, email FROM users`).pipe(Effect.orDie)
    const idOf = (email: string) => users.find((user) => user.email === email)?.id ?? ""
    return { ana: idOf(anaEmail), bruno: idOf(brunoEmail), demo: idOf(demoEmail) }
  })

const namesOf = (body: unknown) =>
  Schema.decodeUnknownSync(Schema.Array(Schema.Struct({ name: Schema.String })))(body).map(
    (lead) => lead.name,
  )

it.effect("lets a seller create a lead owned by themselves", () =>
  Effect.gen(function* () {
    const { send, sql } = yield* makeTestApi
    const cookie = yield* loginAs(send, anaEmail, sellerPassword)
    const response = yield* createLead(send, cookie)
    expect(response.status).toBe(201)
    expect(yield* jsonOf(response)).toMatchObject({ seller: { name: "Ana Souza" } })
    const ids = yield* idsByEmail(sql)
    const rows = yield* decodeLeadRows(yield* sql`SELECT seller_id, created_by FROM leads`)
    expect(rows).toEqual([{ seller_id: ids.ana, created_by: ids.ana }])
  }).pipe(Effect.scoped),
)

it.effect("forbids a seller from choosing the responsible seller", () =>
  Effect.gen(function* () {
    const { send, sql } = yield* makeTestApi
    const cookie = yield* loginAs(send, anaEmail, sellerPassword)
    const ids = yield* idsByEmail(sql)
    expect((yield* createLead(send, cookie, { sellerId: ids.bruno })).status).toBe(403)
    expect((yield* createLead(send, cookie, { sellerId: ids.ana })).status).toBe(403)
  }).pipe(Effect.scoped),
)

it.effect("lets a supervisor assign a lead to a seller", () =>
  Effect.gen(function* () {
    const { send, sql } = yield* makeTestApi
    const cookie = yield* loginAs(send, demoEmail, demoPassword)
    const ids = yield* idsByEmail(sql)
    const response = yield* createLead(send, cookie, { sellerId: ids.ana })
    expect(response.status).toBe(201)
    expect(yield* jsonOf(response)).toMatchObject({ seller: { name: "Ana Souza" } })
    const rows = yield* decodeLeadRows(yield* sql`SELECT seller_id, created_by FROM leads`)
    expect(rows).toEqual([{ seller_id: ids.ana, created_by: ids.demo }])
  }).pipe(Effect.scoped),
)

it.effect("rejects a supervisor lead without a valid seller", () =>
  Effect.gen(function* () {
    const { send, sql } = yield* makeTestApi
    const cookie = yield* loginAs(send, demoEmail, demoPassword)
    const ids = yield* idsByEmail(sql)
    for (const overrides of [{}, { sellerId: crypto.randomUUID() }, { sellerId: ids.demo }]) {
      const response = yield* createLead(send, cookie, overrides)
      expect(response.status).toBe(422)
      expect(yield* jsonOf(response)).toEqual({ _tag: "InvalidLeadSeller" })
    }
  }).pipe(Effect.scoped),
)

it.effect("rejects invalid payloads", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    const cookie = yield* loginAs(send, anaEmail, sellerPassword)
    for (const overrides of [
      { email: "not-an-email" },
      { phone: "119732144" },
      { source: "TV" },
      { name: "   " },
    ]) {
      expect((yield* createLead(send, cookie, overrides)).status).toBe(400)
    }
  }).pipe(Effect.scoped),
)

it.effect("stores blank optional fields as null and trims the job title", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    const cookie = yield* loginAs(send, anaEmail, sellerPassword)
    const blank = yield* createLead(send, cookie, { jobTitle: "  ", notes: "" })
    expect(blank.status).toBe(201)
    expect(yield* jsonOf(blank)).toMatchObject({ jobTitle: null, notes: null })
    const trimmed = yield* createLead(send, cookie, { jobTitle: " Síndica " })
    expect(trimmed.status).toBe(201)
    expect(yield* jsonOf(trimmed)).toMatchObject({ jobTitle: "Síndica" })
  }).pipe(Effect.scoped),
)

it.effect("requires a session", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    expect((yield* listLeads(send)).status).toBe(401)
    expect((yield* createLead(send, "")).status).toBe(401)
  }).pipe(Effect.scoped),
)

it.effect("shows sellers only their own leads and supervisors all of them, newest first", () =>
  Effect.gen(function* () {
    const { send, sql } = yield* makeTestApi
    const ana = yield* loginAs(send, anaEmail, sellerPassword)
    const bruno = yield* loginAs(send, brunoEmail, sellerPassword)
    const demo = yield* loginAs(send, demoEmail, demoPassword)
    const ids = yield* idsByEmail(sql)
    yield* createLead(send, ana, { name: "Lead da Ana" })
    yield* createLead(send, bruno, { name: "Lead do Bruno" })
    yield* createLead(send, demo, { name: "Lead do supervisor", sellerId: ids.bruno })

    expect(namesOf(yield* jsonOf(yield* listLeads(send, ana)))).toEqual(["Lead da Ana"])
    expect(namesOf(yield* jsonOf(yield* listLeads(send, bruno)))).toHaveLength(2)
    expect(namesOf(yield* jsonOf(yield* listLeads(send, demo)))).toEqual([
      "Lead do supervisor",
      "Lead do Bruno",
      "Lead da Ana",
    ])
  }).pipe(Effect.scoped),
)

it.effect("filters by seller and hides other sellers from restricted callers", () =>
  Effect.gen(function* () {
    const { send, sql } = yield* makeTestApi
    const ana = yield* loginAs(send, anaEmail, sellerPassword)
    const bruno = yield* loginAs(send, brunoEmail, sellerPassword)
    const demo = yield* loginAs(send, demoEmail, demoPassword)
    const ids = yield* idsByEmail(sql)
    yield* createLead(send, ana, { name: "Lead da Ana" })
    yield* createLead(send, bruno, { name: "Lead do Bruno" })
    yield* createLead(send, demo, { name: "Lead do supervisor", sellerId: ids.bruno })

    const byBruno = yield* listLeads(send, demo, `?sellerId=${ids.bruno}`)
    expect(namesOf(yield* jsonOf(byBruno))).toHaveLength(2)
    const anaViewingBruno = yield* listLeads(send, ana, `?sellerId=${ids.bruno}`)
    expect(anaViewingBruno.status).toBe(200)
    expect(yield* jsonOf(anaViewingBruno)).toEqual([])
  }).pipe(Effect.scoped),
)

it.effect("searches name, company and email, treating wildcards literally", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApi
    const cookie = yield* loginAs(send, anaEmail, sellerPassword)
    yield* createLead(send, cookie)
    yield* createLead(send, cookie, { name: "100% Fit", company: "Academia", email: "fit@a.com" })
    yield* createLead(send, cookie, { name: "1000 Fit", company: "Academia", email: "fit2@a.com" })

    const search = (term: string) =>
      listLeads(send, cookie, `?search=${encodeURIComponent(term)}`).pipe(
        Effect.flatMap(jsonOf),
        Effect.map(namesOf),
      )
    expect(yield* search("reserva")).toEqual(["Juliana Mendes"])
    expect(yield* search("JULIANA@")).toEqual(["Juliana Mendes"])
    expect(yield* search("juli")).toEqual(["Juliana Mendes"])
    expect(yield* search("100%")).toEqual(["100% Fit"])
  }).pipe(Effect.scoped),
)

const decodeStatuses = Schema.decodeUnknownSync(
  Schema.Array(Schema.Struct({ name: Schema.String, status: Schema.String })),
)

const createDealFor = (send: Send, cookie: string, leadId: string, status: string) =>
  send(
    new Request("http://localhost/deals", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ title: `Deal ${status}`, leadId, valueCents: 100_000, status }),
    }),
  ).pipe(Effect.tap((response) => Effect.sync(() => expect(response.status).toBe(201))))

it.effect("derives the lead status from its deals", () =>
  Effect.gen(function* () {
    const { send, sql } = yield* makeTestApi
    const cookie = yield* loginAs(send, anaEmail, sellerPassword)
    const idOf = (response: Response) =>
      Effect.map(
        jsonOf(response),
        (body) => Schema.decodeUnknownSync(Schema.Struct({ id: Schema.String }))(body).id,
      )
    yield* createLead(send, cookie, { name: "Sem negócio" })
    const open = yield* idOf(yield* createLead(send, cookie, { name: "Aberto" }))
    const won = yield* idOf(yield* createLead(send, cookie, { name: "Ganho" }))
    const lost = yield* idOf(yield* createLead(send, cookie, { name: "Perdido" }))
    yield* createDealFor(send, cookie, open, "NEW")
    yield* createDealFor(send, cookie, open, "PROPOSAL_SENT")
    yield* createDealFor(send, cookie, open, "CONTACTED")
    const openLeadWonDeal = yield* idOf(yield* createDealFor(send, cookie, open, "NEW"))
    yield* createDealFor(send, cookie, won, "NEW")
    yield* createDealFor(send, cookie, won, "NEW")
    yield* createDealFor(send, cookie, lost, "NEW")
    yield* sql`UPDATE deals SET status = 'LOST', lost_reason = 'PRICE', closed_at = now() WHERE lead_id IN (${won}, ${lost})`
    yield* sql`UPDATE deals SET status = 'WON', closed_at = now() WHERE id = ${openLeadWonDeal}`
    yield* sql`UPDATE deals SET status = 'WON', lost_reason = NULL, closed_at = now() WHERE id = (SELECT id FROM deals WHERE lead_id = ${won} LIMIT 1)`

    const statusByName = Object.fromEntries(
      decodeStatuses(yield* jsonOf(yield* listLeads(send, cookie))).map((lead) => [
        lead.name,
        lead.status,
      ]),
    )
    expect(statusByName).toEqual({
      "Sem negócio": "NEW",
      Aberto: "PROPOSAL_SENT",
      Ganho: "WON",
      Perdido: "LOST",
    })
    expect(namesOf(yield* jsonOf(yield* listLeads(send, cookie, "?status=NEW")))).toEqual([
      "Sem negócio",
    ])
    expect(namesOf(yield* jsonOf(yield* listLeads(send, cookie, "?status=WON")))).toEqual(["Ganho"])
    expect((yield* listLeads(send, cookie, "?status=OPEN")).status).toBe(400)
  }).pipe(Effect.scoped),
)
