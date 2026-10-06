import type { AssistantMessage } from "@crm/contract"
import { Context, Effect, Layer, Option, Predicate, Schema } from "effect"
import type { Prompt } from "effect/unstable/ai"
import { ConversationsRepository } from "./conversations.ts"
import { Assistant } from "./service.ts"

export const contextMessageCount = 12
const compactionThreshold = 16

const ConversationSummary = Schema.Struct({ summary: Schema.String })

const summaryInstructions = [
  "You summarize a conversation between a user and the assistant of a sales CRM.",
  "Merge the previous summary, if any, with the new messages into one updated summary.",
  "Write at most 10 short lines in Brazilian Portuguese.",
  "Keep what is needed to continue the conversation: the user's goals, filters and names they mentioned, and the figures already given.",
  "Reply only with the summary.",
].join(" ")

const summaryPrompt = (
  previousSummary: string | null,
  messages: ReadonlyArray<Pick<AssistantMessage, "role" | "content">>,
): Prompt.RawInput => [
  { role: "system", content: summaryInstructions },
  {
    role: "user",
    content: [
      `Previous summary:\n${previousSummary ?? "none"}`,
      "",
      "New messages:",
      ...messages.map(
        ({ role, content }) => `${role === "USER" ? "User" : "Assistant"}: ${content}`,
      ),
    ].join("\n"),
  },
]

const defectTagOf = (defect: unknown) =>
  Predicate.hasProperty(defect, "_tag") && typeof defect._tag === "string" ? defect._tag : "Unknown"

// Rolls the messages that fell out of the model's context window into the stored summary. It runs
// detached after the reply is saved, so failures are only logged and the stored summary stays as
// it was. Only tags are logged: causes can carry message text. Interrupts are left alone.
export class Compaction extends Context.Service<
  Compaction,
  { readonly compact: (userId: string, conversationId: string) => Effect.Effect<void> }
>()("crm/Compaction") {}

export const CompactionLive = Layer.effect(
  Compaction,
  Effect.gen(function* () {
    const conversations = yield* ConversationsRepository
    const assistant = yield* Assistant

    const compact = (userId: string, conversationId: string) => {
      const logFailure = (
        reason: { readonly sqlErrorReason: string } | { readonly aiErrorReason: string },
      ) =>
        Effect.logWarning("Conversation compaction failed").pipe(
          Effect.annotateLogs({ conversationId, userId, ...reason }),
        )
      return Effect.gen(function* () {
        const conversation = yield* conversations.findOwned(conversationId, userId)
        if (Option.isNone(conversation)) return
        const { summary, summarizedUpTo } = conversation.value
        const count = yield* conversations.countMessages(conversationId)
        if (count - summarizedUpTo < compactionThreshold) return
        const upTo = count - contextMessageCount
        const messages = yield* conversations.messagesRange(
          conversationId,
          summarizedUpTo,
          upTo - summarizedUpTo,
        )
        const updated = yield* assistant.generate({
          feature: "ASSISTANT_SUMMARY",
          userId,
          dealId: null,
          prompt: summaryPrompt(summary, messages),
          schema: ConversationSummary,
          objectName: "conversation_summary",
        })
        yield* conversations.updateSummary(conversationId, updated.summary.trim(), upTo)
      }).pipe(
        Effect.catchTags({
          SqlError: (error) => logFailure({ sqlErrorReason: error.reason._tag }),
          AssistantUnavailable: (error) => logFailure({ aiErrorReason: error._tag }),
          AssistantRateLimited: (error) => logFailure({ aiErrorReason: error._tag }),
        }),
        Effect.catchDefect((defect) =>
          Effect.logError("Conversation compaction crashed").pipe(
            Effect.annotateLogs({ conversationId, userId, defectTag: defectTagOf(defect) }),
          ),
        ),
      )
    }

    return Compaction.of({ compact })
  }),
)
