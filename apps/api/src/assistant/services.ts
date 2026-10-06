import { Layer } from "effect"
import { RateLimiter } from "effect/unstable/persistence"
import { AssistantChatLive } from "./chat.ts"
import { CompactionLive } from "./compaction.ts"
import { ConversationsRepositoryLive } from "./conversations.ts"
import { PageContextLive } from "./page-context.ts"
import { AiUsageRepositoryLive } from "./repository.ts"
import { AssistantLive } from "./service.ts"
import { SuggestionsLive } from "./suggestions.ts"
import { ChatToolsLive } from "./tools/step.ts"

// The model-facing service and the conversation store: what next-step suggestions and compaction need.
export const AssistantCoreLive = Layer.mergeAll(
  AssistantLive.pipe(
    Layer.provide([
      AiUsageRepositoryLive,
      RateLimiter.layer.pipe(Layer.provide(RateLimiter.layerStoreMemory)),
    ]),
  ),
  ConversationsRepositoryLive,
)

// Everything the assistant endpoints use, built on the core services.
export const AssistantServicesLive = Layer.mergeAll(AssistantChatLive, SuggestionsLive).pipe(
  Layer.provideMerge(Layer.mergeAll(ChatToolsLive, PageContextLive, CompactionLive)),
  Layer.provideMerge(AssistantCoreLive),
)
