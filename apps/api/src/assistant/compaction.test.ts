import { expect, it } from "@effect/vitest"
import { Context, Effect, Layer, Option } from "effect"
import { TestClock } from "effect/testing"
import type { LanguageModel } from "effect/unstable/ai"
import { SqlClient } from "effect/unstable/sql"
import { aiUsageRows } from "#src/testing/ai-usage.ts"
import { seededEmails, seededUserIds, sellerPassword, TestDatabase } from "#src/testing/database.ts"
import { decodeReply } from "#src/testing/fixtures.ts"
import { jsonOf, jsonRequest, loginAs, makeTestApiWith } from "#src/testing/http.ts"
import {
  failingModel,
  fakeLanguageModel,
  type PromptMessages,
  promptText,
  scriptedLanguageModel,
} from "#src/testing/language-model.ts"
import { Compaction, CompactionLive } from "./compaction.ts"
import { ConversationsRepository, ConversationsRepositoryLive } from "./conversations.ts"
import { AssistantCoreLive } from "./services.ts"

const messageText = (position: number) => `mensagem-${String(position).padStart(2, "0")}`

const makeCompactionFixture = (model: Layer.Layer<LanguageModel.LanguageModel>) =>
  Effect.gen(function* () {
    const database = yield* Layer.build(TestDatabase)
    const sql = Context.get(database, SqlClient.SqlClient)
    const services = CompactionLive.pipe(
      Layer.provideMerge(AssistantCoreLive),
      Layer.provide(model),
      Layer.provide(Layer.succeedContext(database)),
    )
    const context = yield* Layer.build(services)
    const conversations = Context.get(context, ConversationsRepository)
    const { compact } = Context.get(context, Compaction)
    const ids = yield* seededUserIds(sql)
    const conversation = yield* conversations.create(ids.ana, "Conversa longa")
    const appendMessages = (from: number, to: number) =>
      Effect.forEach(
        Array.from({ length: to - from }, (_, offset) => from + offset),
        (position) =>
          conversations.appendMessage(
            conversation.id,
            position % 2 === 0 ? "USER" : "ASSISTANT",
            messageText(position),
            [],
          ),
      )
    const stored = Effect.map(conversations.findOwned(conversation.id, ids.ana), Option.getOrThrow)
    return {
      sql,
      userId: ids.ana,
      conversationId: conversation.id,
      compact,
      appendMessages,
      stored,
    }
  })

it.effect("compacts at 16 unsummarized messages and rolls the previous summary forward", () =>
  Effect.gen(function* () {
    const prompts: Array<PromptMessages> = []
    const fixture = yield* makeCompactionFixture(
      fakeLanguageModel(Effect.succeed(JSON.stringify({ summary: " Resumo novo " })), prompts),
    )
    yield* fixture.appendMessages(0, 15)
    yield* fixture.compact(fixture.userId, fixture.conversationId)
    expect(prompts).toHaveLength(0)

    yield* fixture.appendMessages(15, 16)
    yield* fixture.compact(fixture.userId, fixture.conversationId)
    const first = yield* fixture.stored
    expect([first.summary, first.summarizedUpTo]).toEqual(["Resumo novo", 4])
    expect(prompts).toHaveLength(1)
    const firstPrompt = promptText(prompts[0] ?? [])
    expect(firstPrompt).toContain(messageText(0))
    expect(firstPrompt).toContain(messageText(3))
    expect(firstPrompt).not.toContain(messageText(4))

    yield* fixture.appendMessages(16, 19)
    yield* fixture.compact(fixture.userId, fixture.conversationId)
    expect(prompts).toHaveLength(1)

    yield* fixture.appendMessages(19, 20)
    yield* fixture.compact(fixture.userId, fixture.conversationId)
    const second = yield* fixture.stored
    expect(second.summarizedUpTo).toBe(8)
    expect(prompts).toHaveLength(2)
    const secondPrompt = promptText(prompts[1] ?? [])
    expect(secondPrompt).toContain("Resumo novo")
    expect(secondPrompt).toContain(messageText(4))
    expect(secondPrompt).toContain(messageText(7))
    expect(secondPrompt).not.toContain(messageText(3))
    expect(secondPrompt).not.toContain(messageText(8))

    const usage = yield* aiUsageRows(fixture.sql)
    expect(usage.map(({ feature, outcome, dealId }) => [feature, outcome, dealId])).toEqual([
      ["ASSISTANT_SUMMARY", "SUCCEEDED", null],
      ["ASSISTANT_SUMMARY", "SUCCEEDED", null],
    ])
  }).pipe(Effect.scoped),
)

it.effect("leaves the stored summary untouched when the summary call fails", () =>
  Effect.gen(function* () {
    const fixture = yield* makeCompactionFixture(failingModel)
    yield* fixture.appendMessages(0, 16)
    yield* fixture.compact(fixture.userId, fixture.conversationId)
    const stored = yield* fixture.stored
    expect([stored.summary, stored.summarizedUpTo]).toEqual([null, 0])
    const usage = yield* aiUsageRows(fixture.sql)
    expect(usage.map(({ feature, outcome }) => [feature, outcome])).toEqual([
      ["ASSISTANT_SUMMARY", "FAILED"],
    ])
  }).pipe(Effect.scoped),
)

it.effect("sends the stored summary with the next prompt", () =>
  Effect.gen(function* () {
    const prompts: Array<PromptMessages> = []
    const { send, sql } = yield* makeTestApiWith(
      fakeLanguageModel(Effect.succeed("Claro."), prompts),
    )
    const ids = yield* seededUserIds(sql)
    const ana = yield* loginAs(send, seededEmails.ana, sellerPassword)
    const conversations = yield* ConversationsRepository.pipe(
      Effect.provide(
        ConversationsRepositoryLive.pipe(Layer.provide(Layer.succeed(SqlClient.SqlClient)(sql))),
      ),
    )
    const conversation = yield* conversations.create(ids.ana, "Conversa")
    yield* conversations.appendMessage(conversation.id, "USER", "Oi", [])
    yield* conversations.updateSummary(
      conversation.id,
      "O usuário busca negócios da Academia Alfa",
      1,
    )

    yield* send(
      jsonRequest(
        "POST",
        "/assistant/messages",
        { message: "E agora?", conversationId: conversation.id },
        ana,
      ),
    )
    // The summary reaches the model as a user message before the question.
    expect(promptText(prompts[0] ?? [])).toContain("O usuário busca negócios da Academia Alfa")
  }).pipe(Effect.scoped),
)

it.effect("answers normally when the background compaction fails", () =>
  Effect.gen(function* () {
    const { send, sql } = yield* makeTestApiWith(
      scriptedLanguageModel([
        [
          {
            type: "tool-call",
            name: "respond",
            params: { kind: "DATA_ANSWER", text: "Resposta normal.", linkIds: [] },
          },
        ],
      ]),
    )
    const ids = yield* seededUserIds(sql)
    const ana = yield* loginAs(send, seededEmails.ana, sellerPassword)
    const conversations = yield* ConversationsRepository.pipe(
      Effect.provide(
        ConversationsRepositoryLive.pipe(Layer.provide(Layer.succeed(SqlClient.SqlClient)(sql))),
      ),
    )
    const conversation = yield* conversations.create(ids.ana, "Conversa")
    for (let position = 0; position < 15; position++)
      yield* conversations.appendMessage(conversation.id, "USER", messageText(position), [])

    const response = yield* send(
      jsonRequest(
        "POST",
        "/assistant/messages",
        { message: "Mais uma", conversationId: conversation.id },
        ana,
      ),
    )
    expect(response.status).toBe(200)
    expect(decodeReply(yield* jsonOf(response)).reply.content).toBe("Resposta normal.")
    // The detached compaction fails (the script has no second step); waiting for its usage row
    // keeps it from outliving the database.
    yield* Effect.flatMap(aiUsageRows(sql), (rows) =>
      rows.length < 2
        ? Effect.andThen(TestClock.adjust("100 millis"), Effect.fail("compaction still running"))
        : Effect.void,
    ).pipe(Effect.retry({ times: 2000 }))
    expect((yield* aiUsageRows(sql)).map(({ feature }) => feature)).toEqual([
      "ASSISTANT_CHAT",
      "ASSISTANT_SUMMARY",
    ])
  }).pipe(Effect.scoped),
)
