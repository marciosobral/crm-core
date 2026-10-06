import {
  type AssistantRateLimited,
  type AssistantReply,
  type AssistantUnavailable,
  conversationTitleMaxLength,
  isDataTool,
  type SendAssistantMessagePayload,
  truncate,
  type User,
} from "@crm/contract"
import { Context, DateTime, Effect, Layer, Option, Schema } from "effect"
import type { SqlError } from "effect/unstable/sql"
import { businessTime } from "#src/platform/time.ts"
import { type AnswerKind, type FinalReply, finalizeAnswer, isRefusal } from "./answer.ts"
import { chatPrompt } from "./chat-prompt.ts"
import { Compaction, contextMessageCount } from "./compaction.ts"
import { ConversationsRepository } from "./conversations.ts"
import { makeLinkCollector } from "./links.ts"
import { PageContext } from "./page-context.ts"
import { Assistant, type ToolUnavailable } from "./service.ts"
import { ChatTools } from "./tools/step.ts"
import { makeTraceCollector } from "./trace.ts"

export class ConversationNotFound extends Schema.TaggedError<ConversationNotFound>()(
  "ConversationNotFound",
  {},
) {}

export class AssistantChat extends Context.Service<
  AssistantChat,
  {
    readonly sendMessage: (
      user: User,
      payload: typeof SendAssistantMessagePayload.Type,
    ) => Effect.Effect<
      typeof AssistantReply.Type,
      | ConversationNotFound
      | AssistantRateLimited
      | AssistantUnavailable
      | ToolUnavailable
      | SqlError.SqlError
    >
  }
>()("crm/AssistantChat") {}

const logOutcome = (
  rejected: FinalReply["rejected"],
  userId: string,
  conversationId: string | null,
  kind?: AnswerKind,
) => {
  const annotate = Effect.annotateLogs({
    userId,
    ...(conversationId === null ? {} : { conversationId }),
  })
  if (rejected === null)
    return Effect.logInfo("Assistant answered").pipe(Effect.annotateLogs({ kind }), annotate)
  if (isRefusal(rejected))
    return Effect.logInfo("Assistant refused").pipe(
      Effect.annotateLogs({ kind: rejected }),
      annotate,
    )
  return Effect.logWarning("Assistant reply replaced").pipe(
    Effect.annotateLogs({ guardReason: rejected }),
    annotate,
  )
}

const unsavedExchange = (
  conversationId: string | null,
  message: string,
  reply: FinalReply,
  createdAt: DateTime.Utc,
) => ({
  conversationId,
  isSaved: false,
  userMessage: {
    id: crypto.randomUUID(),
    role: "USER" as const,
    content: message,
    links: [],
    createdAt,
  },
  reply: {
    id: crypto.randomUUID(),
    role: "ASSISTANT" as const,
    content: reply.text,
    links: reply.links,
    createdAt,
  },
})

export const AssistantChatLive = Layer.effect(
  AssistantChat,
  Effect.gen(function* () {
    const conversations = yield* ConversationsRepository
    const assistant = yield* Assistant
    const compaction = yield* Compaction
    const chatTools = yield* ChatTools
    const pageContext = yield* PageContext
    const { businessNow } = yield* businessTime
    // Compaction outlives the request but not the API: tying it to this scope interrupts it on
    // shutdown instead of letting it query a closed database.
    const apiScope = yield* Effect.scope

    const findConversation = (user: User, conversationId: string | undefined) =>
      Effect.gen(function* () {
        if (conversationId === undefined) return null
        const conversation = yield* conversations.findOwned(conversationId, user.id)
        if (Option.isNone(conversation)) return yield* new ConversationNotFound()
        return conversation.value
      })

    const sendMessage = (user: User, payload: typeof SendAssistantMessagePayload.Type) =>
      Effect.gen(function* () {
        yield* assistant.reserveChatMessage(user.id)
        const existing = yield* findConversation(user, payload.conversationId)
        const conversationId = existing?.id ?? null
        const history =
          existing === null
            ? []
            : yield* conversations.recentContext(existing.id, contextMessageCount)
        const links = makeLinkCollector()
        const trace = makeTraceCollector()
        const page = yield* pageContext.describe(user, payload.context)
        const { tools, step } = yield* chatTools.forUser(user, links, trace, page.dealId)
        const now = yield* businessNow
        const result = yield* assistant.chat({
          userId: user.id,
          prompt: chatPrompt({
            tools,
            now,
            user,
            summary: existing?.summary ?? null,
            pageDescription: page.description,
            history,
            message: payload.message,
          }),
          step,
        })
        // Nothing is stored before the model answers, so a rate-limited or failed message leaves
        // no conversation or orphan user message behind.
        const reply = finalizeAnswer(result.answer, links, result.toolsUsed.some(isDataTool))
        // A replaced reply is shown but kept out of the history, so it can neither steer later
        // turns nor feed the summary.
        if (reply.rejected !== null) {
          yield* logOutcome(reply.rejected, user.id, conversationId)
          const createdAt = yield* DateTime.now
          return {
            ...unsavedExchange(conversationId, payload.message, reply, createdAt),
            toolsUsed: result.toolsUsed,
          }
        }
        const saved = yield* conversations.saveExchange({
          userId: user.id,
          conversationId,
          title: truncate(payload.message, conversationTitleMaxLength),
          userContent: payload.message,
          replyContent: reply.text,
          replyLinks: reply.links,
          replyTrace: trace.entries(),
        })
        yield* logOutcome(null, user.id, saved.conversationId, result.answer?.kind)
        yield* Effect.forkIn(compaction.compact(user.id, saved.conversationId), apiScope)
        return { ...saved, isSaved: true, toolsUsed: result.toolsUsed }
      })

    return AssistantChat.of({ sendMessage })
  }),
)
