import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai"
import { NodeHttpClient } from "@effect/platform-node"
import { Effect, Layer, Option, Stream } from "effect"
import { AiError, LanguageModel } from "effect/unstable/ai"
import { AssistantConfig } from "#src/platform/config.ts"

const missingKey = AiError.make({
  module: "Assistant",
  method: "generateText",
  reason: new AiError.AuthenticationError({ kind: "MissingKey" }),
})

// Without a key the API still starts; every call fails like a provider error, so the handler
// maps one error type to 503 and never needs to know whether a key exists.
export const UnconfiguredLanguageModel = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.fail(missingKey),
    streamText: () => Stream.fail(missingKey),
  }),
)

export const AssistantProviderLive = Layer.unwrap(
  Effect.gen(function* () {
    const { provider, apiKey, model, reasoningEffort, maxOutputTokens } = yield* AssistantConfig
    if (Option.isNone(apiKey)) {
      yield* Effect.logWarning("AI_API_KEY is not set; the assistant is disabled")
      return UnconfiguredLanguageModel
    }
    switch (provider) {
      case "openai": {
        // The provider spreads this config into the Responses API request, but its type does not
        // list parallel_tool_calls; a variable (not a fresh literal) is not checked for extra
        // keys. One tool call per step keeps an answer from being written before the data exists.
        const config = {
          reasoning: { effort: reasoningEffort },
          max_output_tokens: maxOutputTokens,
          parallel_tool_calls: false,
        }
        return OpenAiLanguageModel.layer({ model, config }).pipe(
          Layer.provide(OpenAiClient.layer({ apiKey: apiKey.value })),
          Layer.provide(NodeHttpClient.layerUndici),
        )
      }
    }
  }),
)
