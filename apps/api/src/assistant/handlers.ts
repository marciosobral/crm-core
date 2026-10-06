import { CrmApi } from "@crm/contract"
import { Effect, Option } from "effect"
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi"
import { requirePermission } from "#src/auth/permissions.ts"
import { failUnavailable } from "#src/platform/http.ts"
import { AssistantChat } from "./chat.ts"
import { ConversationsRepository } from "./conversations.ts"
import { Suggestions } from "./suggestions.ts"

const historyListLimit = 20
const maxMessagesPerConversation = 200

export const AssistantApiLive = HttpApiBuilder.group(CrmApi, "assistant", (handlers) =>
  Effect.gen(function* () {
    const conversations = yield* ConversationsRepository
    const chat = yield* AssistantChat
    const suggestions = yield* Suggestions

    return handlers
      .handle("sendMessage", ({ payload }) =>
        Effect.gen(function* () {
          const user = yield* requirePermission("assistant.chat")
          return yield* chat.sendMessage(user, payload)
        }).pipe(
          Effect.catchTags({
            ConversationNotFound: () => Effect.fail(new HttpApiError.NotFound()),
            SqlError: failUnavailable,
            ToolUnavailable: () => Effect.fail(new HttpApiError.ServiceUnavailable()),
          }),
        ),
      )
      .handle("suggestions", () =>
        Effect.gen(function* () {
          const user = yield* requirePermission("assistant.chat")
          return yield* suggestions.forUser(user)
        }).pipe(Effect.catchTag("SqlError", failUnavailable)),
      )
      .handle("listConversations", () =>
        Effect.gen(function* () {
          const user = yield* requirePermission("assistant.chat")
          return yield* conversations.listForUser(user.id, historyListLimit)
        }).pipe(Effect.catchTag("SqlError", failUnavailable)),
      )
      .handle("getConversation", ({ params }) =>
        Effect.gen(function* () {
          const user = yield* requirePermission("assistant.chat")
          const conversation = yield* conversations.findOwned(params.id, user.id)
          if (Option.isNone(conversation)) return yield* new HttpApiError.NotFound()
          return {
            id: conversation.value.id,
            title: conversation.value.title,
            messages: yield* conversations.recentMessages(params.id, maxMessagesPerConversation),
          }
        }).pipe(Effect.catchTag("SqlError", failUnavailable)),
      )
  }),
)
