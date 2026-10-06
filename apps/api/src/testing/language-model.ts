import { Effect, Layer, Stream } from "effect"
import { AiError, LanguageModel, type Prompt } from "effect/unstable/ai"

export interface Usage {
  readonly input?: number
  readonly cachedInput?: number
  readonly output?: number
  readonly reasoning?: number
}

export type PromptMessages = Prompt.Prompt["content"]

export const textOf = ({ content }: Prompt.Message) =>
  typeof content === "string"
    ? content
    : content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n")

export const promptText = (messages: PromptMessages) => messages.map(textOf).join("\n")

export const toolResultsIn = (messages: PromptMessages) =>
  messages.flatMap(({ content }) =>
    typeof content === "string"
      ? []
      : content.flatMap((part) => (part.type === "tool-result" ? [part] : [])),
  )

export const toolCallsIn = (messages: PromptMessages) =>
  messages.flatMap(({ content }) =>
    typeof content === "string"
      ? []
      : content.flatMap((part) => (part.type === "tool-call" ? [part] : [])),
  )

// The tool results as JSON text, for checking that some data never reached the model.
export const toolResultsJson = (messages: PromptMessages) => JSON.stringify(toolResultsIn(messages))

const finishPart = (usage: Usage) => ({
  type: "finish" as const,
  reason: "stop" as const,
  usage: {
    inputTokens: { total: usage.input, cacheRead: usage.cachedInput },
    outputTokens: { total: usage.output, reasoning: usage.reasoning },
  },
})

const modelFailure = AiError.make({
  module: "Test",
  method: "generateText",
  reason: new AiError.UnknownError({}),
})

export const fakeLanguageModel = (
  reply: Effect.Effect<string, AiError.AiError>,
  prompts: Array<PromptMessages> = [],
  usage: Usage = {},
) =>
  Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: (options) => {
        prompts.push(options.prompt.content)
        return Effect.map(reply, (text) => [{ type: "text", text }, finishPart(usage)])
      },
      streamText: () => Stream.empty,
    }),
  )

export const failingModel = fakeLanguageModel(Effect.fail(modelFailure))

export type ScriptedPart =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "tool-call"; readonly name: string; readonly params: unknown }

interface ScriptOptions {
  // Filled with the messages of every call, for assertions.
  readonly prompts?: Array<PromptMessages>
  readonly usage?: Usage
  // Repeats the last step forever instead of failing once the script runs out.
  readonly repeatLast?: boolean
}

// A model that answers each call with the next scripted step (tool calls and/or text). Running
// past the script fails the call, unless the last step repeats.
export const scriptedLanguageModel = (
  steps: ReadonlyArray<ReadonlyArray<ScriptedPart>>,
  { prompts = [], usage = {}, repeatLast = false }: ScriptOptions = {},
) => {
  let nextStep = 0
  return Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: (options) => {
        prompts.push(options.prompt.content)
        const step = steps[repeatLast ? Math.min(nextStep, steps.length - 1) : nextStep]
        nextStep += 1
        if (step === undefined) return Effect.fail(modelFailure)
        return Effect.succeed([
          ...step.map((part, index) =>
            part.type === "text"
              ? part
              : {
                  type: "tool-call" as const,
                  id: `call-${nextStep}-${index}`,
                  name: part.name,
                  params: part.params,
                },
          ),
          finishPart(usage),
        ])
      },
      streamText: () => Stream.empty,
    }),
  )
}

export const answeringModel = (text: string) =>
  scriptedLanguageModel(
    [[{ type: "tool-call", name: "respond", params: { kind: "DATA_ANSWER", text, linkIds: [] } }]],
    { repeatLast: true },
  )

export const toolCall = (name: string, params: unknown): ScriptedPart => ({
  type: "tool-call",
  name,
  params,
})

export const respond = (
  text: string,
  linkIds: ReadonlyArray<string> = [],
  kind = "DATA_ANSWER",
): ScriptedPart => toolCall("respond", { kind, text, linkIds })
