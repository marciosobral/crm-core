import { hasPermission, type User } from "@crm/contract"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { LanguageModel, type Toolkit } from "effect/unstable/ai"
import { ChatAnswer } from "#src/assistant/answer.ts"
import type { LinkCollector } from "#src/assistant/links.ts"
import type { ChatStep, ChatStepResult } from "#src/assistant/service.ts"
import type { TraceCollector } from "#src/assistant/trace.ts"
import { businessTime } from "#src/platform/time.ts"
import {
  describeTools,
  sellerToolkit,
  supervisorToolkit,
  type ToolDescription,
} from "./definitions.ts"
import { makeToolHandlers, type ToolContext } from "./handlers.ts"

const decodeAnswer = Schema.decodeUnknownOption(ChatAnswer)

const toStepResult = (response: {
  readonly content: ChatStepResult["content"]
  readonly toolCalls: ReadonlyArray<{ readonly name: string; readonly params: unknown }>
  readonly usage: ChatStepResult["usage"]
}): ChatStepResult => {
  const respondCall = response.toolCalls.find(({ name }) => name === "respond")
  return {
    content: response.content,
    toolNames: response.toolCalls.map(({ name }) => name),
    answer: respondCall === undefined ? null : Option.getOrNull(decodeAnswer(respondCall.params)),
    usage: response.usage,
  }
}

const toolChoiceFor = (isLastStep: boolean) =>
  isLastStep ? ({ tool: "respond" } as const) : ("required" as const)

type ChatToolkit =
  | Toolkit.WithHandler<typeof sellerToolkit.tools>
  | Toolkit.WithHandler<typeof supervisorToolkit.tools>

const makeStep =
  (toolkit: ChatToolkit): ChatStep =>
  (prompt, isLastStep) =>
    LanguageModel.generateText({ prompt, toolkit, toolChoice: toolChoiceFor(isLastStep) }).pipe(
      Effect.map(toStepResult),
    )

export interface ChatToolset {
  readonly tools: ReadonlyArray<ToolDescription>
  readonly step: ChatStep
}

export class ChatTools extends Context.Service<
  ChatTools,
  {
    readonly forUser: (
      user: User,
      links: LinkCollector,
      trace: TraceCollector,
      currentDealId: string | null,
    ) => Effect.Effect<ChatToolset>
  }
>()("crm/ChatTools") {}

export const ChatToolsLive = Layer.effect(
  ChatTools,
  Effect.gen(function* () {
    const handlers = yield* makeToolHandlers
    const { businessToday } = yield* businessTime

    return ChatTools.of({
      forUser: (user, links, trace, currentDealId) =>
        Effect.gen(function* () {
          const context: ToolContext = {
            user,
            links,
            trace,
            today: yield* businessToday,
            currentDealId,
          }
          const bound = {
            searchDeals: handlers.searchDeals(context),
            summarizeSales: handlers.summarizeSales(context),
            searchLeads: handlers.searchLeads(context),
            getDealTimeline: handlers.getDealTimeline(context),
            listSellers: handlers.listSellers,
            rankSellers: handlers.rankSellers(context),
            openScreen: handlers.openScreen(context),
            respond: () => Effect.succeed({}),
          }
          // The role picks the toolkit once, so the tools shown in the prompt and the tools the
          // model can call come from the same value.
          if (hasPermission(user, "deal.see_all")) {
            const handlerContext = yield* supervisorToolkit.toHandlers(bound)
            const toolkit = yield* Effect.provide(supervisorToolkit, handlerContext)
            return { tools: describeTools(supervisorToolkit.tools), step: makeStep(toolkit) }
          }
          const handlerContext = yield* sellerToolkit.toHandlers(bound)
          const toolkit = yield* Effect.provide(sellerToolkit, handlerContext)
          return { tools: describeTools(sellerToolkit.tools), step: makeStep(toolkit) }
        }),
    })
  }),
)
