import { expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { demoPassword, seededEmails, seededUserIds, sellerPassword } from "#src/testing/database.ts"
import {
  decodeReply,
  firstToolResult,
  repositoriesOn,
  seedDeal,
  sendMessage,
  userWith,
} from "#src/testing/fixtures.ts"
import { jsonOf, jsonRequest, loginAs, makeTestApiWith } from "#src/testing/http.ts"
import {
  type PromptMessages,
  respond,
  scriptedLanguageModel,
  toolCall,
} from "#src/testing/language-model.ts"
import { PageContext, PageContextLive } from "./page-context.ts"

const userMessageCount = (messages: PromptMessages | undefined) =>
  (messages ?? []).filter(({ role }) => role === "user").length

it.effect("reads the timeline of the page's deal and links it, in scope only", () =>
  Effect.gen(function* () {
    const prompts: Array<PromptMessages> = []
    const { send } = yield* makeTestApiWith(
      scriptedLanguageModel(
        [
          [toolCall("getDealTimeline", { dealId: null })],
          [respond("O último comentário foi: ligar na sexta.", ["L1"])],
          [toolCall("getDealTimeline", { dealId: null })],
          [respond("Não encontrei esse negócio.")],
        ],
        { prompts },
      ),
    )
    const ana = yield* loginAs(send, seededEmails.ana, sellerPassword)
    const bruno = yield* loginAs(send, seededEmails.bruno, sellerPassword)
    const dealId = yield* seedDeal(send, ana, "Academia Alfa", 5_000_000, "NEGOTIATION")
    yield* send(jsonRequest("POST", `/deals/${dealId}/comments`, { body: "Ligar na sexta" }, ana))
    const body = decodeReply(
      yield* jsonOf(
        yield* sendMessage(send, ana, "Qual o último comentário deste negócio?", undefined, {
          page: "DEAL",
          dealId,
        }),
      ),
    )
    // The page description travels as its own user message, before the question.
    expect(userMessageCount(prompts[0])).toBe(2)
    expect(firstToolResult(prompts[1])).toMatchObject({
      found: true,
      dealTitle: "Academia Alfa",
      activities: [
        { kind: "EVENT", text: "Negócio criado" },
        { kind: "EVENT", text: "Vendedor Ana Souza atribuído ao negócio" },
        { kind: "EVENT", text: "Status alterado para Negociação" },
        { kind: "COMMENT", text: "Ligar na sexta", author: "Ana Souza" },
      ],
    })
    expect(body.reply.links).toEqual([{ kind: "OPEN_DEAL", label: "Abrir Academia Alfa", dealId }])
    // Bruno cannot see Ana's deal: the context is ignored silently and the tool finds nothing.
    yield* sendMessage(send, bruno, "Qual o último comentário deste negócio?", undefined, {
      page: "DEAL",
      dealId,
    })
    expect(userMessageCount(prompts[2])).toBe(1)
    expect(firstToolResult(prompts[3])).toMatchObject({ found: false, activities: [] })
  }).pipe(Effect.scoped),
)

it.effect("rejects a page context the contract does not accept", () =>
  Effect.gen(function* () {
    const { send } = yield* makeTestApiWith(scriptedLanguageModel([[respond("Ok.")]]))
    const demo = yield* loginAs(send, seededEmails.demo, demoPassword)
    expect(
      (yield* sendMessage(send, demo, "Oi", undefined, { page: "DEAL", dealId: "x" })).status,
    ).toBe(400)
  }).pipe(Effect.scoped),
)

it.effect("describes the deal, the board filters and the leads page for the model", () =>
  Effect.gen(function* () {
    const { send, sql } = yield* makeTestApiWith(scriptedLanguageModel([]))
    const ids = yield* seededUserIds(sql)
    const ana = yield* loginAs(send, seededEmails.ana, sellerPassword)
    const dealId = yield* seedDeal(send, ana, "Academia Alfa", 5_000_000, "NEGOTIATION")
    const pageContext = yield* PageContext.pipe(
      Effect.provide(PageContextLive.pipe(Layer.provide(repositoriesOn(sql)))),
    )
    const supervisor = userWith("SUPERVISOR", ids.demo, "Conta Demo")
    const bruno = userWith("SELLER", ids.bruno, "Bruno Lima")

    expect(yield* pageContext.describe(supervisor, { page: "DEAL", dealId })).toEqual({
      description:
        'O usuário está vendo o negócio "Academia Alfa" (Negociação), valor R$ 50.000,00, lead Lead Academia Alfa (Empresa Academia Alfa), vendedor Ana Souza.',
      dealId,
    })
    expect(yield* pageContext.describe(bruno, { page: "DEAL", dealId })).toEqual({
      description: null,
      dealId: null,
    })
    expect(
      (yield* pageContext.describe(supervisor, {
        page: "DEALS_BOARD",
        filters: {
          statuses: ["NEGOTIATION"],
          minValueCents: 5_000_000,
          idleDays: 7,
          closedFrom: "2026-10-01",
          closedTo: "2026-10-31",
          sellerId: ids.bruno,
        },
      })).description,
    ).toBe(
      "O usuário está no board de negócios com os filtros: etapas: Negociação; valor ≥ R$ 50.000,00; sem contato há 7+ dias; fechados de 01/10/2026 a 31/10/2026; vendedor: Bruno Lima.",
    )
    expect((yield* pageContext.describe(supervisor, { page: "LEADS" })).description).toBe(
      "O usuário está na lista de leads sem filtros.",
    )
    expect(
      (yield* pageContext.describe(supervisor, {
        page: "LEADS",
        filters: { status: "NEW", sellerId: ids.ana },
      })).description,
    ).toBe("O usuário está na lista de leads com os filtros: etapa: Novo; vendedor: Ana Souza.")
    expect((yield* pageContext.describe(supervisor, { page: "OTHER" })).description).toBeNull()
    expect((yield* pageContext.describe(supervisor, undefined)).description).toBeNull()
  }).pipe(Effect.scoped),
)
