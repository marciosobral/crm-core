import { AssistantScreen, type AssistantToolName, DealStatus } from "@crm/contract"
import { Schema } from "effect"
import { Tool, Toolkit } from "effect/unstable/ai"
import { ChatAnswer } from "#src/assistant/answer.ts"
import { Period } from "#src/assistant/periods.ts"
import {
  DealSearchArguments,
  IgnoredFilter,
  LeadSearchArguments,
  Owner,
} from "#src/assistant/search.ts"
import { ToolUnavailable } from "#src/assistant/service.ts"
import { DealSort } from "#src/deals/repository.ts"

const OwnerFallback = Schema.NullOr(Schema.Literal("SUPERVISOR_TEAM"))

const toolFailure = { failure: ToolUnavailable } as const

export const RankMetric = Schema.Literals(["LEADS", "OPEN_DEALS", "WON_COUNT", "WON_VALUE"])
export type RankMetric = typeof RankMetric.Type

const searchDeals = Tool.make("searchDeals", {
  description:
    "Counts and totals the deals the user can see that match the filters, and returns up to 5 sample deals ordered by sort (VALUE_DESC for the most expensive, VALUE_ASC for the cheapest, NEWEST for the most recent; null means NEWEST). Use it for any question about how many deals, their value, status, idle time or expected close date, and to find the most expensive, cheapest or most recent deal. owner: ME for the user's own deals (meus, eu), TEAM for the whole team or everything the user can see (temos, equipe, todos), null when unspecified. Money fields come formatted in BRL: use them verbatim. Set every unused field to null.",
  parameters: Schema.Struct({
    ...DealSearchArguments.fields,
    owner: Schema.NullOr(Owner),
    sort: Schema.NullOr(DealSort),
  }),
  success: Schema.Struct({
    count: Schema.Number,
    totalValueFormatted: Schema.String,
    sample: Schema.Array(
      Schema.Struct({
        dealId: Schema.String,
        title: Schema.String,
        valueFormatted: Schema.String,
        status: DealStatus,
        sellerName: Schema.String,
        linkId: Schema.String,
      }),
    ),
    ignored: Schema.Array(IgnoredFilter),
    ownerFallback: OwnerFallback,
    linkId: Schema.NullOr(Schema.String),
  }),
  ...toolFailure,
})

const summarizeSales = Tool.make("summarizeSales", {
  description:
    "Summarizes closed deals in a period: how many were won (and their total value) and how many were lost. Use it for questions such as how much was sold today or this month (period TODAY for hoje, YESTERDAY for ontem). owner: ME for the user's own sales, TEAM for the whole team, null when unspecified. Money fields come formatted in BRL: use them verbatim. When a filter could not be applied the numbers are null and ignored explains why.",
  parameters: Schema.Struct({
    period: Period,
    sellerName: Schema.NullOr(Schema.String),
    owner: Schema.NullOr(Owner),
  }),
  success: Schema.Struct({
    wonCount: Schema.NullOr(Schema.Number),
    wonValueFormatted: Schema.NullOr(Schema.String),
    lostCount: Schema.NullOr(Schema.Number),
    period: Schema.NullOr(
      Schema.Struct({ from: Schema.NullOr(Schema.String), to: Schema.NullOr(Schema.String) }),
    ),
    ignored: Schema.Array(IgnoredFilter),
    ownerFallback: OwnerFallback,
    linkId: Schema.NullOr(Schema.String),
  }),
  ...toolFailure,
})

const searchLeads = Tool.make("searchLeads", {
  description:
    "Counts the leads the user can see and returns up to 5 sample leads. status is the lead's current deal status. owner: ME for the user's own leads (meus, eu), TEAM for the whole team or everything the user can see (temos, equipe, todos), null when unspecified. Set every unused field to null.",
  parameters: Schema.Struct({ ...LeadSearchArguments.fields, owner: Schema.NullOr(Owner) }),
  success: Schema.Struct({
    count: Schema.Number,
    sample: Schema.Array(Schema.Struct({ name: Schema.String, company: Schema.String })),
    ignored: Schema.Array(IgnoredFilter),
    ownerFallback: OwnerFallback,
    linkId: Schema.NullOr(Schema.String),
  }),
  ...toolFailure,
})

const getDealTimeline = Tool.make("getDealTimeline", {
  description:
    "Returns the last 10 activities (comments with author and date, and events such as moves and closing) of one deal, oldest first, so the last item is the most recent. dealId null means the deal on the page the user is looking at; pass the dealId of a searchDeals sample row for another deal. Use it for questions about this deal, its last comment or its history.",
  parameters: Schema.Struct({ dealId: Schema.NullOr(Schema.String.check(Schema.isUUID())) }),
  success: Schema.Struct({
    found: Schema.Boolean,
    dealTitle: Schema.NullOr(Schema.String),
    activities: Schema.Array(
      Schema.Struct({
        kind: Schema.Literals(["COMMENT", "EVENT"]),
        at: Schema.String,
        author: Schema.String,
        text: Schema.String,
      }),
    ),
    linkId: Schema.NullOr(Schema.String),
  }),
  ...toolFailure,
})

const rankSellers = Tool.make("rankSellers", {
  description:
    "Ranks every seller, highest first (sellers with zero are included), by one metric: LEADS (leads each owns), OPEN_DEALS (deals still open), WON_COUNT (deals won) or WON_VALUE (total value of deals won). period limits only WON_COUNT and WON_VALUE to deals closed in it; for LEADS and OPEN_DEALS set period null. Use it for comparisons and rankings between sellers, such as which seller has the most leads, who sold the most or how each seller is doing (call it once per metric). Each row has count, valueFormatted (only for WON_VALUE; use it verbatim) and linkId (null when the seller has none). Ties share the same number: name every seller tied at the top.",
  parameters: Schema.Struct({
    metric: RankMetric,
    period: Schema.NullOr(Period),
  }),
  success: Schema.Struct({
    sellers: Schema.Array(
      Schema.Struct({
        sellerName: Schema.String,
        count: Schema.Number,
        valueFormatted: Schema.NullOr(Schema.String),
        linkId: Schema.NullOr(Schema.String),
      }),
    ),
    ignored: Schema.Array(IgnoredFilter),
  }),
  ...toolFailure,
})

const respond = Tool.make("respond", {
  description:
    "Finishes the turn: every answer to the user goes through it, never as plain text. kind: DATA_ANSWER (an answer from tool results or from the user's identity), HOW_TO (explains how to do something in the CRM), NOT_SUPPORTED (the CRM does not have that feature), CONVERSATION (about this conversation itself, a greeting or thanks), OUT_OF_SCOPE (not about the CRM), SENSITIVE (health, safety, personal crises, legal or medical advice), UNCLEAR (gibberish). For OUT_OF_SCOPE, SENSITIVE and UNCLEAR the text is ignored: leave it empty. text: the answer in Brazilian Portuguese, plain text, at most 800 characters. linkIds: ids of the buttons to show, such as L1; empty when none.",
  parameters: ChatAnswer,
  success: Schema.Struct({}),
})

const listSellers = Tool.make("listSellers", {
  description: "Lists the sellers of the company. Use it to answer who the sellers are.",
  success: Schema.Struct({
    count: Schema.Number,
    sellers: Schema.Array(Schema.Struct({ name: Schema.String })),
  }),
  ...toolFailure,
})

const openScreen = Tool.make("openScreen", {
  description:
    "Registers a button that opens a CRM screen. Use it when you explain how to do something in the CRM, with the screen where it is done.",
  parameters: Schema.Struct({ screen: AssistantScreen }),
  success: Schema.Struct({ linkId: Schema.String }),
})

export const sellerToolkit = Toolkit.make(
  searchDeals,
  summarizeSales,
  searchLeads,
  getDealTimeline,
  openScreen,
  respond,
)
export const supervisorToolkit = Toolkit.make(
  searchDeals,
  summarizeSales,
  searchLeads,
  getDealTimeline,
  listSellers,
  rankSellers,
  openScreen,
  respond,
)

export type ToolParameters = {
  readonly [Name in keyof typeof supervisorToolkit.tools]: Tool.Parameters<
    (typeof supervisorToolkit.tools)[Name]
  >
}

// Fails to compile when a toolkit tool is missing from, or unknown to, the contract's tool names.
type KnownToolName = AssistantToolName | "respond"
type ToolNamesMatch<Name extends KnownToolName> = [KnownToolName] extends [Name] ? true : never
export const toolNamesMatch: ToolNamesMatch<keyof typeof supervisorToolkit.tools> = true

export interface ToolDescription {
  readonly name: string
  readonly description: string
}

export const describeTools = (tools: Record<string, Tool.Any>): ReadonlyArray<ToolDescription> =>
  Object.values(tools).map(({ name, description }) => ({ name, description: description ?? "" }))
