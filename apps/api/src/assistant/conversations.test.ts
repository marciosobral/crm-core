import {
  AssistantConversation,
  AssistantConversationSummary,
  type AssistantLink,
} from "@crm/contract"
import { expect, it } from "@effect/vitest"
import { Effect, Layer, Option, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { seededEmails, seededUserIds, sellerPassword } from "#src/testing/database.ts"
import { getAs } from "#src/testing/fixtures.ts"
import { jsonOf, loginAs, makeTestApi } from "#src/testing/http.ts"
import { ConversationsRepository, ConversationsRepositoryLive } from "./conversations.ts"

const makeRepository = (sql: SqlClient.SqlClient) =>
  ConversationsRepository.pipe(
    Effect.provide(
      ConversationsRepositoryLive.pipe(Layer.provide(Layer.succeed(SqlClient.SqlClient)(sql))),
    ),
  )

const decodeConversation = Schema.decodeUnknownSync(AssistantConversation)
const decodeSummaries = Schema.decodeUnknownSync(Schema.Array(AssistantConversationSummary))

const links: ReadonlyArray<AssistantLink> = [
  {
    kind: "VIEW_DEALS",
    label: "Ver no painel",
    filters: { statuses: ["NEGOTIATION", "PROPOSAL_SENT"], minValueCents: 5_000_000, idleDays: 7 },
  },
  { kind: "VIEW_LEADS", label: "Ver leads", filters: { search: "academia", status: "NEW" } },
  { kind: "OPEN_SCREEN", label: "Ir para a tela", screen: "NEW_LEAD" },
]

it.effect("answers 404 for a conversation owned by someone else or that does not exist", () =>
  Effect.gen(function* () {
    const { send, sql } = yield* makeTestApi
    const repository = yield* makeRepository(sql)
    const ids = yield* seededUserIds(sql)
    const ana = yield* loginAs(send, seededEmails.ana, sellerPassword)
    const bruno = yield* loginAs(send, seededEmails.bruno, sellerPassword)
    const conversation = yield* repository.create(ids.ana, "Quanto vendi hoje?")

    expect((yield* getAs(send, ana, `/assistant/conversations/${conversation.id}`)).status).toBe(
      200,
    )
    expect((yield* getAs(send, bruno, `/assistant/conversations/${conversation.id}`)).status).toBe(
      404,
    )
    expect(
      (yield* getAs(send, ana, "/assistant/conversations/00000000-0000-4000-8000-000000000000"))
        .status,
    ).toBe(404)
    expect((yield* getAs(send, ana, "/assistant/conversations/not-a-uuid")).status).toBe(400)
    expect(
      (yield* getAs(send, undefined, `/assistant/conversations/${conversation.id}`)).status,
    ).toBe(401)
    expect((yield* getAs(send, undefined, "/assistant/conversations")).status).toBe(401)
    expect(Option.isNone(yield* repository.findOwned(conversation.id, ids.bruno))).toBe(true)
  }).pipe(Effect.scoped),
)

it.effect("lists only the user's conversations, newest first, at most 20", () =>
  Effect.gen(function* () {
    const { send, sql } = yield* makeTestApi
    const repository = yield* makeRepository(sql)
    const ids = yield* seededUserIds(sql)
    const ana = yield* loginAs(send, seededEmails.ana, sellerPassword)
    for (let index = 0; index < 22; index++) {
      const conversation = yield* repository.create(ids.ana, `Conversa ${index}`)
      yield* sql`
        UPDATE assistant_conversations
        SET updated_at = '2026-10-01T10:00:00Z'::timestamptz + ${index} * interval '1 minute'
        WHERE id = ${conversation.id}
      `
    }
    yield* repository.create(ids.bruno, "Conversa do Bruno")

    const response = yield* getAs(send, ana, "/assistant/conversations")
    expect(response.status).toBe(200)
    const summaries = decodeSummaries(yield* jsonOf(response))
    expect(summaries).toHaveLength(20)
    expect(summaries.map(({ title }) => title)).toEqual(
      Array.from({ length: 20 }, (_, position) => `Conversa ${21 - position}`),
    )
  }).pipe(Effect.scoped),
)

it.effect("returns messages in order with their links intact", () =>
  Effect.gen(function* () {
    const { send, sql } = yield* makeTestApi
    const repository = yield* makeRepository(sql)
    const ids = yield* seededUserIds(sql)
    const ana = yield* loginAs(send, seededEmails.ana, sellerPassword)
    const conversation = yield* repository.create(ids.ana, "Negócios parados")
    yield* repository.appendMessage(conversation.id, "USER", "Quais negócios estão parados?", [])
    yield* repository.appendMessage(conversation.id, "ASSISTANT", "Encontrei 3 negócios.", links)
    yield* repository.appendMessage(conversation.id, "USER", "E os leads?", [])

    const response = yield* getAs(send, ana, `/assistant/conversations/${conversation.id}`)
    expect(response.status).toBe(200)
    const body = decodeConversation(yield* jsonOf(response))
    expect(body.title).toBe("Negócios parados")
    expect(body.messages.map(({ role, content }) => [role, content])).toEqual([
      ["USER", "Quais negócios estão parados?"],
      ["ASSISTANT", "Encontrei 3 negócios."],
      ["USER", "E os leads?"],
    ])
    expect(body.messages.map(({ links: messageLinks }) => messageLinks)).toEqual([[], links, []])
  }).pipe(Effect.scoped),
)

it.effect("windows, counts and summarises messages by sequence", () =>
  Effect.gen(function* () {
    const { sql } = yield* makeTestApi
    const repository = yield* makeRepository(sql)
    const ids = yield* seededUserIds(sql)
    const conversation = yield* repository.create(ids.ana, "Janela")
    const other = yield* repository.create(ids.ana, "Outra")
    for (let index = 1; index <= 5; index++)
      yield* repository.appendMessage(
        conversation.id,
        index % 2 === 1 ? "USER" : "ASSISTANT",
        `m${index}`,
        [],
      )
    yield* repository.appendMessage(other.id, "USER", "outra", [])

    expect(yield* repository.countMessages(conversation.id)).toBe(5)
    const contents = (messages: ReadonlyArray<{ readonly content: string }>) =>
      messages.map(({ content }) => content)
    expect(contents(yield* repository.recentMessages(conversation.id, 3))).toEqual([
      "m3",
      "m4",
      "m5",
    ])
    expect(contents(yield* repository.messagesRange(conversation.id, 1, 2))).toEqual(["m2", "m3"])

    yield* repository.updateSummary(conversation.id, "Resumo", 3)
    const stored = yield* repository.findOwned(conversation.id, ids.ana)
    expect(Option.map(stored, ({ summary, summarizedUpTo }) => [summary, summarizedUpTo])).toEqual(
      Option.some(["Resumo", 3]),
    )

    yield* sql`UPDATE assistant_conversations SET updated_at = '2026-01-01T00:00:00Z' WHERE id = ${conversation.id}`
    yield* repository.saveExchange({
      userId: ids.ana,
      conversationId: conversation.id,
      title: "Janela",
      userContent: "m6",
      replyContent: "m7",
      replyLinks: [],
      replyTrace: [],
    })
    const touched = yield* repository.findOwned(conversation.id, ids.ana)
    expect(
      Option.exists(
        touched,
        ({ updatedAt }) => updatedAt.epochMilliseconds > Date.parse("2026-01-02"),
      ),
    ).toBe(true)
  }).pipe(Effect.scoped),
)

it.effect("saves a whole exchange atomically", () =>
  Effect.gen(function* () {
    const { sql } = yield* makeTestApi
    const repository = yield* makeRepository(sql)
    const ids = yield* seededUserIds(sql)
    const first = yield* repository.saveExchange({
      userId: ids.ana,
      conversationId: null,
      title: "Quanto vendi?",
      userContent: "Quanto vendi?",
      replyContent: "R$ 10,00",
      replyLinks: links,
      replyTrace: [],
    })
    expect(first.userMessage.role).toBe("USER")
    expect(first.reply).toMatchObject({ role: "ASSISTANT", content: "R$ 10,00", links })
    yield* repository.saveExchange({
      userId: ids.ana,
      conversationId: first.conversationId,
      title: "ignored",
      userContent: "E ontem?",
      replyContent: "R$ 5,00",
      replyLinks: [],
      replyTrace: [],
    })
    expect(yield* repository.countMessages(first.conversationId)).toBe(4)

    // A NUL character is rejected by the database, so the reply (the second insert) fails after
    // the user message was already inserted.
    const failed = yield* Effect.exit(
      repository.saveExchange({
        userId: ids.ana,
        conversationId: first.conversationId,
        title: "x",
        userContent: "perdida",
        replyContent: "resposta\u0000invalida",
        replyLinks: [],
        replyTrace: [],
      }),
    )
    expect(failed._tag).toBe("Failure")
    expect(yield* repository.countMessages(first.conversationId)).toBe(4)
    const contents = (yield* repository.recentMessages(first.conversationId, 10)).map(
      ({ content }) => content,
    )
    expect(contents).not.toContain("perdida")
  }).pipe(Effect.scoped),
)

it.effect("drops stored links that no longer decode instead of failing the conversation", () =>
  Effect.gen(function* () {
    const { sql } = yield* makeTestApi
    const repository = yield* makeRepository(sql)
    const ids = yield* seededUserIds(sql)
    const conversation = yield* repository.create(ids.ana, "Links antigos")
    const valid = { kind: "OPEN_SCREEN", label: "Ir para Leads", screen: "LEADS" }
    const stale = [valid, { kind: "REMOVED_KIND", label: "x" }, { kind: "VIEW_DEALS" }]
    yield* sql`
      INSERT INTO assistant_messages (conversation_id, role, content, links)
      VALUES (${conversation.id}, 'ASSISTANT', 'Resposta antiga', ${JSON.stringify(stale)}::jsonb)
    `
    const recent = yield* repository.recentMessages(conversation.id, 10)
    expect(recent).toMatchObject([{ content: "Resposta antiga", links: [valid] }])
    expect(yield* repository.messagesRange(conversation.id, 0, 10)).toMatchObject([
      { links: [valid] },
    ])
  }).pipe(Effect.scoped),
)

const trace = [
  {
    tool: "rankSellers",
    input: ["métrica: negócios ganhos", "status: Ganho"],
    result: ["vendedores: 2", "primeiro: Bruno Lima (1)"],
  },
] as const

it.effect("stores the tool trace with the reply and reads it back with the context", () =>
  Effect.gen(function* () {
    const { sql } = yield* makeTestApi
    const repository = yield* makeRepository(sql)
    const ids = yield* seededUserIds(sql)
    const saved = yield* repository.saveExchange({
      userId: ids.ana,
      conversationId: null,
      title: "Ranking",
      userContent: "Quem vendeu mais?",
      replyContent: "Bruno Lima.",
      replyLinks: [],
      replyTrace: trace,
    })
    expect(yield* repository.recentContext(saved.conversationId, 10)).toMatchObject([
      { role: "USER", trace: [] },
      { role: "ASSISTANT", trace },
    ])
    const stored = yield* sql<{ toolTrace: unknown }>`
      SELECT tool_trace AS "toolTrace" FROM assistant_messages
      WHERE conversation_id = ${saved.conversationId} ORDER BY seq
    `
    expect(stored.map(({ toolTrace }) => toolTrace)).toEqual([null, trace])
    const plain = yield* repository.recentMessages(saved.conversationId, 10)
    expect(plain.flatMap((message) => Object.keys(message))).not.toContain("toolTrace")
  }).pipe(Effect.scoped),
)

it.effect("drops a stored tool trace that no longer decodes instead of failing the context", () =>
  Effect.gen(function* () {
    const { sql } = yield* makeTestApi
    const repository = yield* makeRepository(sql)
    const ids = yield* seededUserIds(sql)
    const conversation = yield* repository.create(ids.ana, "Trace antigo")
    yield* sql`
      INSERT INTO assistant_messages (conversation_id, role, content, tool_trace)
      VALUES (${conversation.id}, 'ASSISTANT', 'Resposta antiga', ${JSON.stringify([{ tool: "removed" }])}::jsonb)
    `
    expect(yield* repository.recentContext(conversation.id, 10)).toMatchObject([
      { content: "Resposta antiga", trace: [] },
    ])
  }).pipe(Effect.scoped),
)
