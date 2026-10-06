import { rolePermissions, User } from "@crm/contract"
import { expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { TestClock } from "effect/testing"
import { aiUsageRows } from "#src/testing/ai-usage.ts"
import { demoPassword, seededEmails, seededUserIds, sellerPassword } from "#src/testing/database.ts"
import {
  closeDeal,
  decodeReply,
  decodeSummaries,
  firstToolResult,
  getAs,
  negotiationQuery,
  noDealFilters,
  noLeadFilters,
  repositoriesOn,
  seedDeal,
  seedPipeline,
  sendMessage,
  thisMonth,
  userWith,
} from "#src/testing/fixtures.ts"
import { jsonOf, jsonRequest, loginAs, makeTestApiWith } from "#src/testing/http.ts"
import {
  type PromptMessages,
  respond,
  scriptedLanguageModel,
  toolCall,
  toolResultsJson,
} from "#src/testing/language-model.ts"
import { formatBrl } from "./format.ts"
import { makeLinkCollector } from "./links.ts"
import { makeToolHandlers } from "./tools/handlers.ts"
import { makeTraceCollector } from "./trace.ts"

const decodeRanked = Schema.decodeUnknownSync(
  Schema.Struct({
    sellers: Schema.Array(
      Schema.Struct({
        sellerName: Schema.String,
        count: Schema.Number,
        valueFormatted: Schema.NullOr(Schema.String),
        linkId: Schema.NullOr(Schema.String),
      }),
    ),
    ignored: Schema.Array(Schema.String),
  }),
)

const rankCall = (metric: string, kind: string | null = null) =>
  toolCall("rankSellers", {
    metric,
    period: kind === null ? null : { kind, days: null, from: null, to: null },
  })

it.effect(
  "answers with exact numbers inside a seller's scope and attaches the referenced link",
  () =>
    Effect.gen(function* () {
      const prompts: Array<PromptMessages> = []
      const { send } = yield* makeTestApiWith(
        scriptedLanguageModel(
          [
            [toolCall("searchDeals", { ...negotiationQuery, sellerName: "Bruno" })],
            [respond("Você tem 2 negócios em negociação.", ["L1"])],
          ],
          { prompts },
        ),
      )
      const ana = yield* loginAs(send, seededEmails.ana, sellerPassword)
      const bruno = yield* loginAs(send, seededEmails.bruno, sellerPassword)
      yield* seedPipeline(send, ana, bruno)
      const response = yield* sendMessage(send, ana, "Quantos negócios tenho em negociação?")
      expect(response.status).toBe(200)
      const body = decodeReply(yield* jsonOf(response))
      expect(body.toolsUsed).toEqual(["searchDeals"])
      expect(body.reply.content).toBe("Você tem 2 negócios em negociação.")
      expect(body.reply.links).toEqual([
        {
          kind: "VIEW_DEALS",
          label: "Ver 2 negócios em negociação",
          filters: { statuses: ["NEGOTIATION"] },
        },
      ])
      expect(body.userMessage.content).toBe("Quantos negócios tenho em negociação?")
      expect(prompts).toHaveLength(2)
      expect(firstToolResult(prompts[1])).toMatchObject({
        count: 2,
        totalValueFormatted: "R$ 80.000,00",
        ignored: ["SELLER_FILTER_UNAVAILABLE"],
        linkId: "L1",
      })
      expect(toolResultsJson(prompts[1] ?? [])).not.toContain("Academia Delta")
    }).pipe(Effect.scoped),
)

it.effect("lets a supervisor see every seller and filter by seller name", () =>
  Effect.gen(function* () {
    const prompts: Array<PromptMessages> = []
    const { send, sql } = yield* makeTestApiWith(
      scriptedLanguageModel(
        [
          [toolCall("searchDeals", negotiationQuery)],
          [respond("São 3 negócios.")],
          [toolCall("searchDeals", { ...negotiationQuery, sellerName: "bruno" })],
          [respond("O Bruno tem 1 negócio.")],
        ],
        { prompts },
      ),
    )
    const ids = yield* seededUserIds(sql)
    const ana = yield* loginAs(send, seededEmails.ana, sellerPassword)
    const bruno = yield* loginAs(send, seededEmails.bruno, sellerPassword)
    const demo = yield* loginAs(send, seededEmails.demo, demoPassword)
    yield* seedPipeline(send, ana, bruno)
    const all = decodeReply(yield* jsonOf(yield* sendMessage(send, demo, "Quantos em negociação?")))
    expect(firstToolResult(prompts[1])).toMatchObject({
      count: 3,
      totalValueFormatted: "R$ 150.000,00",
    })
    // No marker in the answer: every collected link is offered.
    expect(all.reply.links).toEqual([
      {
        kind: "VIEW_DEALS",
        label: "Ver 3 negócios em negociação",
        filters: { statuses: ["NEGOTIATION"] },
      },
    ])
    const filtered = decodeReply(yield* jsonOf(yield* sendMessage(send, demo, "E o Bruno?")))
    expect(firstToolResult(prompts[3])).toMatchObject({
      count: 1,
      totalValueFormatted: "R$ 70.000,00",
      ignored: [],
    })
    expect(filtered.reply.links).toEqual([
      {
        kind: "VIEW_DEALS",
        label: "Ver 1 negócio em negociação de Bruno Lima",
        filters: { statuses: ["NEGOTIATION"], sellerId: ids.bruno },
      },
    ])
  }).pipe(Effect.scoped),
)

it.effect("summarizes sales in a period inside the user's scope", () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(Date.parse("2026-10-15T15:00:00Z"))
    const prompts: Array<PromptMessages> = []
    const { send, sql } = yield* makeTestApiWith(
      scriptedLanguageModel(
        [
          [toolCall("summarizeSales", { period: thisMonth, sellerName: null, owner: null })],
          [respond("Ok.")],
          [toolCall("summarizeSales", { period: thisMonth, sellerName: "Bruno", owner: null })],
          [respond("Ok.")],
          [toolCall("summarizeSales", { period: thisMonth, sellerName: "Carlos", owner: null })],
          [respond("Ok.")],
        ],
        { prompts },
      ),
    )
    const ana = yield* loginAs(send, seededEmails.ana, sellerPassword)
    const bruno = yield* loginAs(send, seededEmails.bruno, sellerPassword)
    const demo = yield* loginAs(send, seededEmails.demo, demoPassword)
    const won1 = yield* seedDeal(send, ana, "Ganho 1", 5_000_000)
    const won2 = yield* seedDeal(send, ana, "Ganho 2", 3_000_000)
    const lost = yield* seedDeal(send, ana, "Perdido", 2_000_000)
    const old = yield* seedDeal(send, ana, "Ganho antigo", 9_000_000)
    const brunoWon = yield* seedDeal(send, bruno, "Ganho do Bruno", 7_000_000)
    yield* closeDeal(sql, won1, "WON", "2026-10-10T15:00:00Z")
    yield* closeDeal(sql, won2, "WON", "2026-10-12T15:00:00Z")
    yield* closeDeal(sql, lost, "LOST", "2026-10-11T15:00:00Z")
    yield* closeDeal(sql, old, "WON", "2026-09-20T15:00:00Z")
    yield* closeDeal(sql, brunoWon, "WON", "2026-10-13T15:00:00Z")

    yield* sendMessage(send, ana, "Quanto vendi este mês?")
    expect(firstToolResult(prompts[1])).toMatchObject({
      wonCount: 2,
      wonValueFormatted: "R$ 80.000,00",
      lostCount: 1,
      period: { from: "2026-10-01", to: "2026-10-31" },
      ignored: [],
    })
    yield* sendMessage(send, demo, "Quanto o Bruno vendeu este mês?")
    expect(firstToolResult(prompts[3])).toMatchObject({
      wonCount: 1,
      wonValueFormatted: "R$ 70.000,00",
      lostCount: 0,
    })
    yield* sendMessage(send, demo, "Quanto o Carlos vendeu este mês?")
    expect(firstToolResult(prompts[5])).toMatchObject({
      wonCount: null,
      wonValueFormatted: null,
      lostCount: null,
      period: null,
      ignored: ["UNKNOWN_SELLER"],
      linkId: null,
    })
  }).pipe(Effect.scoped),
)

it.effect("counts leads inside the user's scope, including through a seller name", () =>
  Effect.gen(function* () {
    const prompts: Array<PromptMessages> = []
    const { send } = yield* makeTestApiWith(
      scriptedLanguageModel(
        [
          [toolCall("searchLeads", noLeadFilters)],
          [respond("Ok.")],
          [toolCall("searchLeads", { ...noLeadFilters, sellerName: "Bruno" })],
          [respond("Ok.")],
          [toolCall("searchLeads", { ...noLeadFilters, status: "NEGOTIATION" })],
          [respond("Ok.")],
          [toolCall("searchLeads", { ...noLeadFilters, sellerName: "Bruno" })],
          [respond("Ok.")],
        ],
        { prompts },
      ),
    )
    const ana = yield* loginAs(send, seededEmails.ana, sellerPassword)
    const bruno = yield* loginAs(send, seededEmails.bruno, sellerPassword)
    const demo = yield* loginAs(send, seededEmails.demo, demoPassword)
    yield* seedPipeline(send, ana, bruno)

    yield* sendMessage(send, ana, "Quantos leads eu tenho?")
    expect(firstToolResult(prompts[1])).toMatchObject({ count: 3, linkId: "L1" })
    expect(toolResultsJson(prompts[1] ?? [])).not.toContain("Academia Delta")
    const named = decodeReply(yield* jsonOf(yield* sendMessage(send, ana, "E os do Bruno?")))
    expect(firstToolResult(prompts[3])).toMatchObject({
      count: 3,
      ignored: ["SELLER_FILTER_UNAVAILABLE"],
    })
    expect(named.reply.links).toEqual([{ kind: "VIEW_LEADS", label: "Ver 3 leads", filters: {} }])
    yield* sendMessage(send, demo, "Leads em negociação?")
    expect(firstToolResult(prompts[5])).toMatchObject({ count: 3 })
    yield* sendMessage(send, demo, "Leads do Bruno?")
    expect(firstToolResult(prompts[7])).toMatchObject({ count: 1 })
  }).pipe(Effect.scoped),
)

it.effect("lets a supervisor list the sellers", () =>
  Effect.gen(function* () {
    const prompts: Array<PromptMessages> = []
    const { send } = yield* makeTestApiWith(
      scriptedLanguageModel([[toolCall("listSellers", {})], [respond("Ok.")]], { prompts }),
    )
    const demo = yield* loginAs(send, seededEmails.demo, demoPassword)
    const reply = decodeReply(
      yield* jsonOf(yield* sendMessage(send, demo, "Quem são os vendedores?")),
    )
    expect(reply.toolsUsed).toEqual(["listSellers"])
    expect(firstToolResult(prompts[1])).toMatchObject({
      sellers: expect.arrayContaining([{ name: "Ana Souza" }, { name: "Bruno Lima" }]),
    })
  }).pipe(Effect.scoped),
)

it.effect("explains how to do something and links the screen with openScreen", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApiWith(
      scriptedLanguageModel([
        [toolCall("openScreen", { screen: "NEW_LEAD" })],
        [respond("Não consigo fazer isso por aqui. Abra Leads e clique em Novo lead.", ["L1"])],
      ]),
    )
    const ana = yield* loginAs(send, seededEmails.ana, sellerPassword)
    const body = decodeReply(yield* jsonOf(yield* sendMessage(send, ana, "Cria um lead pra mim")))
    expect(body.toolsUsed).toEqual(["openScreen"])
    expect(body.reply.content).toBe(
      "Não consigo fazer isso por aqui. Abra Leads e clique em Novo lead.",
    )
    expect(body.reply.links).toEqual([
      { kind: "OPEN_SCREEN", label: "Ir para Novo lead", screen: "NEW_LEAD" },
    ])
  }).pipe(Effect.scoped),
)

it.effect("offers no link for results that dropped a filter or carry no link", () =>
  Effect.gen(function* () {
    const prompts: Array<PromptMessages> = []
    const invalidPeriod = { kind: "NEXT_DAYS", days: 0, from: null, to: null }
    const { send } = yield* makeTestApiWith(
      scriptedLanguageModel(
        [
          [toolCall("searchDeals", { ...noDealFilters, expectedClose: invalidPeriod })],
          [respond("Ok.")],
          [toolCall("summarizeSales", { period: thisMonth, sellerName: "Fulano", owner: null })],
          [respond("Ok.")],
        ],
        { prompts },
      ),
    )
    const demo = yield* loginAs(send, seededEmails.demo, demoPassword)
    const dropped = decodeReply(yield* jsonOf(yield* sendMessage(send, demo, "Negócios?")))
    expect(firstToolResult(prompts[1])).toMatchObject({
      ignored: ["INVALID_PERIOD"],
      linkId: null,
    })
    expect(dropped.reply.links).toEqual([])
    const unlinked = decodeReply(yield* jsonOf(yield* sendMessage(send, demo, "Vendas do Fulano?")))
    expect(firstToolResult(prompts[3])).toMatchObject({ linkId: null })
    expect(unlinked.reply.links).toEqual([])
  }).pipe(Effect.scoped),
)

it.effect("does not widen a seller's sales summary when they name another seller", () =>
  Effect.gen(function* () {
    const prompts: Array<PromptMessages> = []
    const { send } = yield* makeTestApiWith(
      scriptedLanguageModel(
        [
          [toolCall("summarizeSales", { period: thisMonth, sellerName: "Bruno", owner: null })],
          [respond("Você não pode ver as vendas de outros vendedores.")],
        ],
        { prompts },
      ),
    )
    const ana = yield* loginAs(send, seededEmails.ana, sellerPassword)
    const bruno = yield* loginAs(send, seededEmails.bruno, sellerPassword)
    yield* seedPipeline(send, ana, bruno)
    expect((yield* sendMessage(send, ana, "Quanto o Bruno vendeu?")).status).toBe(200)
    expect(firstToolResult(prompts[1])).toMatchObject({
      wonCount: null,
      wonValueFormatted: null,
      lostCount: null,
      ignored: ["SELLER_FILTER_UNAVAILABLE"],
      linkId: null,
    })
  }).pipe(Effect.scoped),
)

// The RC fails the whole generation when the model calls a tool that is not in the toolkit, so the
// message is answered with 503 and nothing is stored; a seller never receives supervisor data.
it.effect("answers 503 when a seller's model calls a tool it was not given", () =>
  Effect.gen(function* () {
    const prompts: Array<PromptMessages> = []
    const { send, sql } = yield* makeTestApiWith(
      scriptedLanguageModel([[toolCall("listSellers", {})], [respond("Ana e Bruno")]], { prompts }),
    )
    const ana = yield* loginAs(send, seededEmails.ana, sellerPassword)
    const response = yield* sendMessage(send, ana, "Quem são os vendedores?")
    expect(response.status).toBe(503)
    expect(yield* jsonOf(response)).toMatchObject({ _tag: "AssistantUnavailable" })
    expect(prompts).toHaveLength(1)
    expect(yield* aiUsageRows(sql)).toMatchObject([{ outcome: "FAILED" }])
    expect(
      decodeSummaries(yield* jsonOf(yield* getAs(send, ana, "/assistant/conversations"))),
    ).toEqual([])
  }).pipe(Effect.scoped),
)

it("formats cents as reais for the model", () => {
  expect(formatBrl(14_500_000)).toBe("R$ 145.000,00")
  expect(formatBrl(5)).toBe("R$ 0,05")
})

it.effect("returns money formatted by the server and the most expensive deal first", () =>
  Effect.gen(function* () {
    const prompts: Array<PromptMessages> = []
    const { send } = yield* makeTestApiWith(
      scriptedLanguageModel(
        [
          [toolCall("searchDeals", { ...noDealFilters, sort: "VALUE_DESC" })],
          [respond("O mais caro é Academia Alfa, R$ 145.000,00.", ["L2"])],
          [toolCall("searchDeals", { ...noDealFilters, sort: "VALUE_ASC" })],
          [respond("O mais barato é Academia Gama.")],
        ],
        { prompts },
      ),
    )
    const ana = yield* loginAs(send, seededEmails.ana, sellerPassword)
    yield* seedDeal(send, ana, "Academia Alfa", 14_500_000)
    yield* seedDeal(send, ana, "Academia Beta", 3_000_000)
    yield* seedDeal(send, ana, "Academia Gama", 1_000_050)
    const body = decodeReply(
      yield* jsonOf(yield* sendMessage(send, ana, "Qual o negócio mais caro?")),
    )
    expect(firstToolResult(prompts[1])).toMatchObject({
      count: 3,
      totalValueFormatted: "R$ 185.000,50",
      sample: [
        { title: "Academia Alfa", valueFormatted: "R$ 145.000,00" },
        { title: "Academia Beta", valueFormatted: "R$ 30.000,00" },
        { title: "Academia Gama", valueFormatted: "R$ 10.000,50" },
      ],
    })
    expect(body.reply.links).toEqual([
      {
        kind: "OPEN_DEAL",
        label: "Abrir Academia Alfa",
        dealId: expect.any(String),
      },
    ])
    yield* sendMessage(send, ana, "E o mais barato?")
    expect(firstToolResult(prompts[3])).toMatchObject({
      sample: [{ title: "Academia Gama" }, { title: "Academia Beta" }, { title: "Academia Alfa" }],
    })
  }).pipe(Effect.scoped),
)

it.effect("counts and sums in SQL while sampling at most five deals", () =>
  Effect.gen(function* () {
    const prompts: Array<PromptMessages> = []
    const { send } = yield* makeTestApiWith(
      scriptedLanguageModel(
        [
          [toolCall("searchDeals", { ...noDealFilters, sort: "VALUE_DESC" })],
          [respond("Você tem 7 negócios.")],
          [toolCall("searchLeads", { status: null, sellerName: null, search: null, owner: null })],
          [respond("Você tem 7 leads.")],
        ],
        { prompts },
      ),
    )
    const ana = yield* loginAs(send, seededEmails.ana, sellerPassword)
    for (let index = 1; index <= 7; index++)
      yield* seedDeal(send, ana, `Negócio ${index}`, index * 100_000)
    yield* sendMessage(send, ana, "Quantos negócios?")
    const result = firstToolResult(prompts[1])
    expect(result).toMatchObject({ count: 7, totalValueFormatted: "R$ 28.000,00" })
    expect(
      Schema.decodeUnknownSync(Schema.Struct({ sample: Schema.Array(Schema.Unknown) }))(result)
        .sample,
    ).toHaveLength(5)
    yield* sendMessage(send, ana, "Quantos leads?")
    const leads = Schema.decodeUnknownSync(
      Schema.Struct({ count: Schema.Number, sample: Schema.Array(Schema.Unknown) }),
    )(firstToolResult(prompts[3]))
    expect([leads.count, leads.sample.length]).toEqual([7, 5])
  }).pipe(Effect.scoped),
)

it.effect(
  "answers owner ME with the team for a supervisor, flagged, and keeps sellers on their own",
  () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(Date.parse("2026-10-15T15:00:00Z"))
      const prompts: Array<PromptMessages> = []
      const leadFilters = { status: null, sellerName: null, search: null }
      const { send, sql } = yield* makeTestApiWith(
        scriptedLanguageModel(
          [
            [toolCall("searchLeads", { ...leadFilters, owner: "ME" })],
            [respond("Nenhum lead está atribuído a você.")],
            [toolCall("searchLeads", { ...leadFilters, owner: "TEAM" })],
            [respond("Temos 4 leads.")],
            [toolCall("searchDeals", { ...noDealFilters, owner: "ME" })],
            [respond("Nenhum negócio é seu.")],
            [toolCall("summarizeSales", { period: thisMonth, sellerName: null, owner: "ME" })],
            [respond("Você não vendeu nada.")],
            [toolCall("searchDeals", { ...noDealFilters, owner: "TEAM" })],
            [respond("São 4 negócios.")],
            [toolCall("searchLeads", { ...leadFilters, owner: "ME" })],
            [respond("Você tem 3 leads.")],
            [toolCall("searchLeads", { ...leadFilters, owner: "TEAM" })],
            [respond("Você tem 3 leads.")],
          ],
          { prompts },
        ),
      )
      const ana = yield* loginAs(send, seededEmails.ana, sellerPassword)
      const bruno = yield* loginAs(send, seededEmails.bruno, sellerPassword)
      const demo = yield* loginAs(send, seededEmails.demo, demoPassword)
      yield* seedPipeline(send, ana, bruno)
      const won = yield* seedDeal(send, ana, "Ganho", 100_000)
      yield* closeDeal(sql, won, "WON", "2026-10-10T15:00:00Z")

      yield* sendMessage(send, demo, "Quantos leads eu tenho?")
      expect(firstToolResult(prompts[1])).toMatchObject({
        count: 5,
        ownerFallback: "SUPERVISOR_TEAM",
      })
      yield* sendMessage(send, demo, "Quantos leads temos?")
      expect(firstToolResult(prompts[3])).toMatchObject({ count: 5, ownerFallback: null })
      yield* sendMessage(send, demo, "Quantos negócios eu tenho?")
      expect(firstToolResult(prompts[5])).toMatchObject({
        count: 5,
        ownerFallback: "SUPERVISOR_TEAM",
      })
      yield* sendMessage(send, demo, "Quanto eu vendi?")
      expect(firstToolResult(prompts[7])).toMatchObject({
        wonCount: 1,
        wonValueFormatted: "R$ 1.000,00",
        ownerFallback: "SUPERVISOR_TEAM",
      })
      yield* sendMessage(send, demo, "Quantos negócios temos?")
      expect(firstToolResult(prompts[9])).toMatchObject({ count: 5, ownerFallback: null })
      // For a seller, ME and TEAM both mean their own scope.
      yield* sendMessage(send, ana, "Quantos leads eu tenho?")
      expect(firstToolResult(prompts[11])).toMatchObject({ count: 4, ownerFallback: null })
      yield* sendMessage(send, ana, "Quantos leads temos?")
      expect(firstToolResult(prompts[13])).toMatchObject({ count: 4, ownerFallback: null })
    }).pipe(Effect.scoped),
)

it.effect("ranks sellers by leads, keeping sellers with zero", () =>
  Effect.gen(function* () {
    const prompts: Array<PromptMessages> = []
    const { send, sql } = yield* makeTestApiWith(
      scriptedLanguageModel([[rankCall("LEADS")], [respond("Ana Souza tem 2 leads.", ["L1"])]], {
        prompts,
      }),
    )
    const ids = yield* seededUserIds(sql)
    const ana = yield* loginAs(send, seededEmails.ana, sellerPassword)
    const demo = yield* loginAs(send, seededEmails.demo, demoPassword)
    yield* seedDeal(send, ana, "Academia Alfa", 5_000_000)
    yield* seedDeal(send, ana, "Academia Beta", 3_000_000)
    const body = decodeReply(yield* jsonOf(yield* sendMessage(send, demo, "Quem tem mais leads?")))
    expect(decodeRanked(firstToolResult(prompts[1]))).toEqual({
      sellers: [
        { sellerName: "Ana Souza", count: 2, valueFormatted: null, linkId: "L1" },
        { sellerName: "Bruno Lima", count: 0, valueFormatted: null, linkId: null },
      ],
      ignored: [],
    })
    expect(body.reply.links).toEqual([
      { kind: "VIEW_LEADS", label: "Ver 2 leads de Ana Souza", filters: { sellerId: ids.ana } },
    ])
  }).pipe(Effect.scoped),
)

it.effect("keeps sellers tied on the metric together, in name order", () =>
  Effect.gen(function* () {
    const prompts: Array<PromptMessages> = []
    const { send } = yield* makeTestApiWith(
      scriptedLanguageModel([[rankCall("OPEN_DEALS")], [respond("Os dois têm 1 negócio.")]], {
        prompts,
      }),
    )
    const ana = yield* loginAs(send, seededEmails.ana, sellerPassword)
    const bruno = yield* loginAs(send, seededEmails.bruno, sellerPassword)
    const demo = yield* loginAs(send, seededEmails.demo, demoPassword)
    yield* seedDeal(send, bruno, "Academia Delta", 7_000_000, "NEGOTIATION")
    yield* seedDeal(send, ana, "Academia Alfa", 5_000_000)
    yield* sendMessage(send, demo, "Quem tem mais negócios abertos?")
    expect(
      decodeRanked(firstToolResult(prompts[1])).sellers.map(({ sellerName, count }) => [
        sellerName,
        count,
      ]),
    ).toEqual([
      ["Ana Souza", 1],
      ["Bruno Lima", 1],
    ])
  }).pipe(Effect.scoped),
)

it.effect("ranks sellers by won value inside a period and ties by name", () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(Date.parse("2026-10-15T15:00:00Z"))
    const prompts: Array<PromptMessages> = []
    const { send, sql } = yield* makeTestApiWith(
      scriptedLanguageModel(
        [
          [rankCall("WON_VALUE", "THIS_MONTH")],
          [respond("Bruno Lima vendeu mais.", ["L1"])],
          [rankCall("WON_COUNT", "THIS_MONTH")],
          [respond("Empatados.")],
          [rankCall("WON_COUNT", "NEXT_DAYS")],
          [respond("Não deu.")],
        ],
        { prompts },
      ),
    )
    const ids = yield* seededUserIds(sql)
    const ana = yield* loginAs(send, seededEmails.ana, sellerPassword)
    const bruno = yield* loginAs(send, seededEmails.bruno, sellerPassword)
    const demo = yield* loginAs(send, seededEmails.demo, demoPassword)
    const anaWon = yield* seedDeal(send, ana, "Ganho da Ana", 5_000_000)
    const anaOld = yield* seedDeal(send, ana, "Ganho antigo", 9_000_000)
    const brunoWon = yield* seedDeal(send, bruno, "Ganho do Bruno", 7_000_000)
    yield* closeDeal(sql, anaWon, "WON", "2026-10-10T15:00:00Z")
    yield* closeDeal(sql, anaOld, "WON", "2026-09-20T15:00:00Z")
    yield* closeDeal(sql, brunoWon, "WON", "2026-10-12T15:00:00Z")
    const body = decodeReply(yield* jsonOf(yield* sendMessage(send, demo, "Quem mais vendeu?")))
    expect(decodeRanked(firstToolResult(prompts[1])).sellers).toEqual([
      { sellerName: "Bruno Lima", count: 1, valueFormatted: "R$ 70.000,00", linkId: "L1" },
      { sellerName: "Ana Souza", count: 1, valueFormatted: "R$ 50.000,00", linkId: "L2" },
    ])
    expect(body.reply.links).toEqual([
      {
        kind: "VIEW_DEALS",
        label: "Ver 1 negócio ganho de Bruno Lima (de 01/10 a 31/10)",
        filters: {
          statuses: ["WON"],
          closedFrom: "2026-10-01",
          closedTo: "2026-10-31",
          sellerId: ids.bruno,
        },
      },
    ])
    yield* sendMessage(send, demo, "E em quantidade?")
    expect(
      decodeRanked(firstToolResult(prompts[3])).sellers.map(({ sellerName }) => sellerName),
    ).toEqual(["Ana Souza", "Bruno Lima"])
    yield* sendMessage(send, demo, "E nos próximos dias?")
    expect(decodeRanked(firstToolResult(prompts[5]))).toEqual({
      sellers: [],
      ignored: ["INVALID_PERIOD"],
    })
  }).pipe(Effect.scoped),
)

it.effect("reports a period given to a metric that takes none, and still ranks", () =>
  Effect.gen(function* () {
    const prompts: Array<PromptMessages> = []
    const { send } = yield* makeTestApiWith(
      scriptedLanguageModel(
        [
          [rankCall("LEADS", "THIS_MONTH")],
          [respond("Ok.")],
          [rankCall("OPEN_DEALS", "TODAY")],
          [respond("Ok.")],
        ],
        { prompts },
      ),
    )
    const demo = yield* loginAs(send, seededEmails.demo, demoPassword)
    yield* sendMessage(send, demo, "Quem tem mais leads este mês?")
    const leads = decodeRanked(firstToolResult(prompts[1]))
    expect(leads.ignored).toEqual(["PERIOD_NOT_APPLICABLE"])
    expect(leads.sellers).toHaveLength(2)
    yield* sendMessage(send, demo, "Quem tem mais negócios abertos hoje?")
    expect(decodeRanked(firstToolResult(prompts[3])).ignored).toEqual(["PERIOD_NOT_APPLICABLE"])
  }).pipe(Effect.scoped),
)

it.effect("answers 503 and counts no data when a tool query fails", () =>
  Effect.gen(function* () {
    const prompts: Array<PromptMessages> = []
    const { send, sql } = yield* makeTestApiWith(
      scriptedLanguageModel(
        [[toolCall("searchLeads", noLeadFilters)], [respond("Você tem 99 leads.")]],
        { prompts },
      ),
    )
    const ana = yield* loginAs(send, seededEmails.ana, sellerPassword)
    yield* sql`DROP TABLE deals CASCADE`
    const response = yield* sendMessage(send, ana, "Quantos leads tenho?")
    expect(response.status).toBe(503)
    expect(yield* jsonOf(response)).toMatchObject({ _tag: "ServiceUnavailable" })
    expect(prompts).toHaveLength(1)
    expect(yield* aiUsageRows(sql)).toMatchObject([{ outcome: "FAILED" }])
  }).pipe(Effect.scoped),
)

it.effect("offers rankSellers to supervisors only", () =>
  Effect.gen(function* () {
    const { send, sql } = yield* makeTestApiWith(scriptedLanguageModel([[rankCall("LEADS")]]))
    const ana = yield* loginAs(send, seededEmails.ana, sellerPassword)
    const response = yield* sendMessage(send, ana, "Quem tem mais leads?")
    expect(response.status).toBe(503)
    expect(yield* aiUsageRows(sql)).toHaveLength(1)
  }).pipe(Effect.scoped),
)

it.effect("offers the team button for an owner-ME search by a supervisor", () =>
  Effect.gen(function* () {
    const prompts: Array<PromptMessages> = []
    const { send } = yield* makeTestApiWith(
      scriptedLanguageModel(
        [
          [toolCall("searchDeals", { ...noDealFilters, owner: "ME" })],
          [respond("A equipe tem 1 negócio.", ["L1"])],
        ],
        { prompts },
      ),
    )
    const ana = yield* loginAs(send, seededEmails.ana, sellerPassword)
    const demo = yield* loginAs(send, seededEmails.demo, demoPassword)
    yield* seedDeal(send, ana, "Academia Alfa", 5_000_000)
    const body = decodeReply(
      yield* jsonOf(yield* sendMessage(send, demo, "Quantos negócios tenho?")),
    )
    expect(firstToolResult(prompts[1])).toMatchObject({
      count: 1,
      ownerFallback: "SUPERVISOR_TEAM",
      linkId: "L1",
    })
    expect(body.reply.links).toHaveLength(1)
  }).pipe(Effect.scoped),
)

it.effect("returns the newest ten activities of a deal in chronological order", () =>
  Effect.gen(function* () {
    const prompts: Array<PromptMessages> = []
    const { send } = yield* makeTestApiWith(
      scriptedLanguageModel([[toolCall("getDealTimeline", { dealId: null })], [respond("Ok.")]], {
        prompts,
      }),
    )
    const ana = yield* loginAs(send, seededEmails.ana, sellerPassword)
    const dealId = yield* seedDeal(send, ana, "Academia Alfa", 5_000_000)
    for (let index = 1; index <= 12; index++)
      yield* send(
        jsonRequest("POST", `/deals/${dealId}/comments`, { body: `Comentário ${index}` }, ana),
      )
    yield* sendMessage(send, ana, "Qual o histórico?", undefined, { page: "DEAL", dealId })
    const { activities } = Schema.decodeUnknownSync(
      Schema.Struct({ activities: Schema.Array(Schema.Struct({ text: Schema.String })) }),
    )(firstToolResult(prompts[1]))
    expect(activities.map(({ text }) => text)).toEqual(
      Array.from({ length: 10 }, (_, index) => `Comentário ${index + 3}`),
    )
  }).pipe(Effect.scoped),
)

it.effect("ranks no sellers by leads for a user without lead.see_all", () =>
  Effect.gen(function* () {
    const { sql } = yield* makeTestApiWith(scriptedLanguageModel([]))
    const ids = yield* seededUserIds(sql)
    const supervisor = userWith("SUPERVISOR", ids.demo, "Conta Demo")
    const dealsOnly = new User({
      ...supervisor,
      permissions: rolePermissions.SUPERVISOR.filter((permission) => permission !== "lead.see_all"),
    })
    const handlers = yield* makeToolHandlers.pipe(Effect.provide(repositoriesOn(sql)))
    const rank = handlers.rankSellers({
      user: dealsOnly,
      links: makeLinkCollector(),
      trace: makeTraceCollector(),
      today: "2026-10-06",
      currentDealId: null,
    })
    expect(yield* rank({ metric: "LEADS", period: null })).toEqual({
      sellers: [],
      ignored: ["SELLER_FILTER_UNAVAILABLE"],
    })
  }).pipe(Effect.scoped),
)

it.effect("offers no link for sellers with zero counts and traces the ranking", () =>
  Effect.gen(function* () {
    const { sql } = yield* makeTestApiWith(scriptedLanguageModel([]))
    const ids = yield* seededUserIds(sql)
    const handlers = yield* makeToolHandlers.pipe(Effect.provide(repositoriesOn(sql)))
    const supervisor = userWith("SUPERVISOR", ids.demo, "Conta Demo")
    const rankOpen = Effect.gen(function* () {
      const links = makeLinkCollector()
      const trace = makeTraceCollector()
      const rank = handlers.rankSellers({
        user: supervisor,
        links,
        trace,
        today: "2026-10-06",
        currentDealId: null,
      })
      const ranked = decodeRanked(yield* rank({ metric: "OPEN_DEALS", period: null }))
      return { ranked, links, trace }
    })

    const empty = yield* rankOpen
    expect(empty.links.collected()).toEqual([])
    expect(empty.ranked.sellers.map(({ linkId }) => linkId)).toEqual([null, null])
    expect(empty.trace.entries()).toEqual([
      {
        tool: "rankSellers",
        input: [
          "métrica: negócios abertos",
          "status: Novo, Contato Feito, Proposta Enviada, Negociação",
        ],
        result: ["vendedores: 2"],
      },
    ])
  }).pipe(Effect.scoped),
)

it.effect("offers a default link for the top seller, or for every seller tied at the top", () =>
  Effect.gen(function* () {
    const { send, sql } = yield* makeTestApiWith(
      scriptedLanguageModel(
        [
          [rankCall("WON_COUNT")],
          [respond("Bruno Lima tem mais negócios fechados, com 2.")],
          [rankCall("WON_COUNT")],
          [respond("Ana Souza e Bruno Lima empatam, com 2.")],
        ],
        { repeatLast: false },
      ),
    )
    const ids = yield* seededUserIds(sql)
    const ana = yield* loginAs(send, seededEmails.ana, sellerPassword)
    const bruno = yield* loginAs(send, seededEmails.bruno, sellerPassword)
    const demo = yield* loginAs(send, seededEmails.demo, demoPassword)
    for (const [cookie, title] of [
      [ana, "Ganho da Ana"],
      [bruno, "Ganho 1 do Bruno"],
      [bruno, "Ganho 2 do Bruno"],
    ] as const)
      yield* closeDeal(
        sql,
        yield* seedDeal(send, cookie, title, 1_000_000),
        "WON",
        "2026-10-10T15:00:00Z",
      )

    const single = decodeReply(
      yield* jsonOf(yield* sendMessage(send, demo, "Qual vendedor tem mais negócios fechados?")),
    )
    expect(single.reply.links).toEqual([
      {
        kind: "VIEW_DEALS",
        label: "Ver 2 negócios ganhos de Bruno Lima",
        filters: { statuses: ["WON"], sellerId: ids.bruno },
      },
    ])

    yield* closeDeal(
      sql,
      yield* seedDeal(send, ana, "Ganho 2 da Ana", 1_000_000),
      "WON",
      "2026-10-11T15:00:00Z",
    )
    const tied = decodeReply(
      yield* jsonOf(yield* sendMessage(send, demo, "E agora, quem tem mais?")),
    )
    expect(tied.reply.links.map(({ label }) => label)).toEqual([
      "Ver 2 negócios ganhos de Ana Souza",
      "Ver 2 negócios ganhos de Bruno Lima",
    ])
  }).pipe(Effect.scoped),
)
