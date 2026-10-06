import {
  AssistantRateLimited,
  AssistantToolName,
  AssistantUnavailable,
  type Deal,
  type DealActivity,
  DealNextStep,
} from "@crm/contract"
import { Context, type DateTime, Duration, Effect, Layer, Result, Schema } from "effect"
import { AiError, LanguageModel, Prompt, type Response } from "effect/unstable/ai"
import { RateLimiter } from "effect/unstable/persistence"
import { AssistantConfig } from "#src/platform/config.ts"
import type { ChatAnswer } from "./answer.ts"
import { type AiFeature, assistantFeatures } from "./features.ts"
import { nextStepPrompt } from "./prompt.ts"
import { AiUsageRepository } from "./repository.ts"

const maxChatSteps = 5

const isToolName = Schema.is(AssistantToolName)

// What a tool handler fails with once the failure itself was logged: the model never sees it, and
// the whole message is answered as a service failure, not as an unavailable model.
export class ToolUnavailable extends Schema.TaggedError<ToolUnavailable>()("ToolUnavailable", {}) {}

// Lets callModel re-fail a tool failure as itself while a call that has no tools stays typed
// without it.
const isToolUnavailable = <E>(error: unknown): error is Extract<E, ToolUnavailable> =>
  error instanceof ToolUnavailable

export interface ChatStepResult {
  readonly content: ReadonlyArray<Response.AnyPart>
  readonly toolNames: ReadonlyArray<string>
  readonly answer: ChatAnswer | null
  readonly usage: Response.Usage
}

// One model call with the user's tools already bound. The caller builds it because the toolkit
// differs per role, and generateText only type-checks against a concrete toolkit. On the last
// allowed step the model is forced to call respond, so a turn never ends without an answer.
export type ChatStep = (
  prompt: Prompt.Prompt,
  isLastStep: boolean,
) => Effect.Effect<ChatStepResult, AiError.AiError | ToolUnavailable, LanguageModel.LanguageModel>

export interface ChatResult {
  readonly answer: ChatAnswer | null
  readonly toolsUsed: ReadonlyArray<AssistantToolName>
}

export class Assistant extends Context.Service<
  Assistant,
  {
    readonly generate: <
      S extends Schema.Encoder<Record<string, unknown>, unknown> & {
        readonly DecodingServices: never
      },
    >(request: {
      readonly feature: AiFeature
      readonly userId: string
      readonly dealId: string | null
      readonly prompt: Prompt.RawInput
      readonly schema: S
      readonly objectName: string
    }) => Effect.Effect<S["Type"], AssistantRateLimited | AssistantUnavailable>
    readonly suggestNextStep: (request: {
      readonly userId: string
      readonly deal: Deal
      readonly activities: ReadonlyArray<DealActivity>
      readonly now: DateTime.Zoned
    }) => Effect.Effect<DealNextStep, AssistantRateLimited | AssistantUnavailable>
    // Consumes one chat message from the user's rate limit; call it before any other work.
    readonly reserveChatMessage: (
      userId: string,
    ) => Effect.Effect<void, AssistantRateLimited | AssistantUnavailable>
    readonly chat: (request: {
      readonly userId: string
      readonly prompt: Prompt.RawInput
      readonly step: ChatStep
    }) => Effect.Effect<ChatResult, AssistantRateLimited | AssistantUnavailable | ToolUnavailable>
  }
>()("crm/Assistant") {}

export const AssistantLive = Layer.effect(
  Assistant,
  Effect.gen(function* () {
    const languageModel = yield* LanguageModel.LanguageModel
    const rateLimiter = yield* RateLimiter.RateLimiter
    const aiUsage = yield* AiUsageRepository
    const config = yield* AssistantConfig

    const recordUsage = (
      request: {
        readonly feature: AiFeature
        readonly userId: string
        readonly dealId: string | null
      },
      durationMs: number,
      usage: Response.Usage | null,
    ) =>
      aiUsage
        .record({
          userId: request.userId,
          dealId: request.dealId,
          feature: request.feature,
          provider: config.provider,
          model: config.model,
          reasoningEffort: config.reasoningEffort,
          outcome: usage === null ? "FAILED" : "SUCCEEDED",
          inputTokens: usage?.inputTokens.total ?? null,
          cachedInputTokens: usage?.inputTokens.cacheRead ?? null,
          outputTokens: usage?.outputTokens.total ?? null,
          reasoningTokens: usage?.outputTokens.reasoning ?? null,
          durationMs: Math.round(durationMs),
        })
        .pipe(
          Effect.catchTag("SqlError", (error) =>
            Effect.logWarning("Recording AI usage failed").pipe(
              Effect.annotateLogs({
                feature: request.feature,
                userId: request.userId,
                dealId: request.dealId,
                sqlErrorReason: error.reason._tag,
              }),
            ),
          ),
        )

    const consumeRateLimit = (feature: AiFeature, userId: string) =>
      rateLimiter
        .consume({
          key: `${feature}:${userId}`,
          limit: assistantFeatures[feature].perMinute,
          window: "1 minute",
          algorithm: "fixed-window",
          onExceeded: "fail",
        })
        .pipe(
          Effect.catchTag("RateLimiterError", ({ reason }) =>
            Effect.fail(
              reason._tag === "RateLimitExceeded"
                ? new AssistantRateLimited({
                    retryAfterSeconds: Math.ceil(Duration.toSeconds(reason.retryAfter)),
                  })
                : new AssistantUnavailable(),
            ),
          ),
        )

    const callModel = <A, E extends AiError.AiError | ToolUnavailable>(
      request: {
        readonly feature: AiFeature
        readonly userId: string
        readonly dealId: string | null
      },
      call: Effect.Effect<A, E>,
      usageOf: (value: A) => Response.Usage,
    ) =>
      Effect.gen(function* () {
        const [duration, result] = yield* call.pipe(
          Effect.timeout("15 seconds"),
          Effect.result,
          Effect.timed,
        )
        const durationMs = Duration.toMillis(duration)
        if (Result.isFailure(result)) {
          const error = result.failure
          yield* recordUsage(request, durationMs, null)
          if (isToolUnavailable<E>(error)) return yield* Effect.fail(error)
          yield* Effect.logWarning("Assistant call failed").pipe(
            Effect.annotateLogs({
              feature: request.feature,
              userId: request.userId,
              dealId: request.dealId,
              aiErrorReason: AiError.isAiError(error) ? error.reason._tag : error._tag,
            }),
          )
          return yield* new AssistantUnavailable()
        }
        yield* recordUsage(request, durationMs, usageOf(result.success))
        return result.success
      })

    const generate: Assistant["Service"]["generate"] = (request) =>
      Effect.gen(function* () {
        yield* consumeRateLimit(request.feature, request.userId)
        const { value } = yield* callModel(
          request,
          languageModel.generateObject({
            prompt: request.prompt,
            schema: request.schema,
            objectName: request.objectName,
          }),
          ({ usage }) => usage,
        )
        return value
      })

    return Assistant.of({
      generate,
      suggestNextStep: ({ userId, deal, activities, now }) =>
        generate({
          feature: "NEXT_STEP",
          userId,
          dealId: deal.id,
          prompt: nextStepPrompt(deal, activities, now),
          schema: DealNextStep,
          objectName: "next_step",
        }).pipe(
          Effect.map(({ action, reason }) => ({ action: action.trim(), reason: reason.trim() })),
        ),
      reserveChatMessage: (userId) => consumeRateLimit("ASSISTANT_CHAT", userId),
      chat: ({ userId, prompt: initialPrompt, step: runStep }) =>
        Effect.gen(function* () {
          const usageRequest = { feature: "ASSISTANT_CHAT", userId, dealId: null } as const
          const toolsUsed = new Set<AssistantToolName>()
          let prompt = Prompt.make(initialPrompt)
          for (let step = 0; step < maxChatSteps; step++) {
            const response = yield* callModel(
              usageRequest,
              runStep(prompt, step === maxChatSteps - 1).pipe(
                Effect.provideService(LanguageModel.LanguageModel, languageModel),
              ),
              ({ usage }) => usage,
            )
            const otherToolNames = response.toolNames.filter((name) => name !== "respond")
            for (const name of otherToolNames) if (isToolName(name)) toolsUsed.add(name)
            // A respond called together with other tools was written before their results
            // existed, so it is dropped and the model answers again with the results in hand.
            if (response.answer !== null && otherToolNames.length === 0)
              return { answer: response.answer, toolsUsed: [...toolsUsed] }
            // Plain text without respond is never shown: it cannot be classified or vetted.
            if (response.toolNames.length === 0) return { answer: null, toolsUsed: [...toolsUsed] }
            const partsWithoutRespond = response.content.filter(
              (part) => !("name" in part && part.name === "respond"),
            )
            prompt = Prompt.concat(prompt, Prompt.fromResponseParts(partsWithoutRespond))
          }
          return { answer: null, toolsUsed: [...toolsUsed] }
        }),
    })
  }),
)
