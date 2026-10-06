import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiError, HttpApiGroup } from "effect/unstable/httpapi"
import { Authorization } from "./auth.ts"
import { DealFilters } from "./deal-filters.ts"
import { ListLeadsQuery } from "./leads.ts"
import { requiredText } from "./text.ts"

export class AssistantRateLimited extends Schema.TaggedError<AssistantRateLimited>()(
  "AssistantRateLimited",
  { retryAfterSeconds: Schema.Int },
  { httpApiStatus: 429 },
) {}

export class AssistantUnavailable extends Schema.TaggedError<AssistantUnavailable>()(
  "AssistantUnavailable",
  {},
  { httpApiStatus: 503 },
) {}

export const AssistantScreen = Schema.Literals(["NEW_LEAD", "NEW_DEAL", "LEADS", "DEALS"])
export type AssistantScreen = typeof AssistantScreen.Type

export const AssistantLink = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("VIEW_DEALS"), label: Schema.String, filters: DealFilters }),
  Schema.Struct({
    kind: Schema.Literal("VIEW_LEADS"),
    label: Schema.String,
    filters: ListLeadsQuery,
  }),
  Schema.Struct({
    kind: Schema.Literal("OPEN_DEAL"),
    label: Schema.String,
    dealId: Schema.String.check(Schema.isUUID()),
  }),
  Schema.Struct({
    kind: Schema.Literal("OPEN_SCREEN"),
    label: Schema.String,
    screen: AssistantScreen,
  }),
])
export type AssistantLink = typeof AssistantLink.Type

export const AssistantMessageRole = Schema.Literals(["USER", "ASSISTANT"])
export type AssistantMessageRole = typeof AssistantMessageRole.Type

export const AssistantMessage = Schema.Struct({
  id: Schema.String,
  role: AssistantMessageRole,
  content: Schema.String,
  links: Schema.Array(AssistantLink),
  createdAt: Schema.DateTimeUtcFromString,
})
export type AssistantMessage = typeof AssistantMessage.Type

export const AssistantConversationSummary = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  updatedAt: Schema.DateTimeUtcFromString,
})
export type AssistantConversationSummary = typeof AssistantConversationSummary.Type

export const AssistantConversation = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  messages: Schema.Array(AssistantMessage),
})
export type AssistantConversation = typeof AssistantConversation.Type

export const assistantMessageMaxLength = 1000

export const conversationTitleMaxLength = 60

// What the user is looking at. The server only trusts ids and filters from it, never free text.
export const AssistantPageContext = Schema.Union([
  Schema.Struct({
    page: Schema.Literal("DEALS_BOARD"),
    filters: Schema.optionalKey(DealFilters),
  }),
  Schema.Struct({
    page: Schema.Literal("DEAL"),
    dealId: Schema.String.check(Schema.isUUID()),
  }),
  Schema.Struct({
    page: Schema.Literal("LEADS"),
    filters: Schema.optionalKey(ListLeadsQuery),
  }),
  Schema.Struct({ page: Schema.Literals(["LEAD_NEW", "DEAL_NEW", "OTHER"]) }),
])
export type AssistantPageContext = typeof AssistantPageContext.Type

export const SendAssistantMessagePayload = Schema.Struct({
  conversationId: Schema.optionalKey(Schema.String.check(Schema.isUUID())),
  message: requiredText(assistantMessageMaxLength),
  context: Schema.optionalKey(AssistantPageContext),
})

// The tools whose results are CRM data: any number in an answer must come from one of them.
export const DataToolName = Schema.Literals([
  "searchDeals",
  "summarizeSales",
  "searchLeads",
  "getDealTimeline",
  "listSellers",
  "rankSellers",
])
export type DataToolName = typeof DataToolName.Type

export const isDataTool = Schema.is(DataToolName)

export const AssistantToolName = Schema.Literals([...DataToolName.literals, "openScreen"])
export type AssistantToolName = typeof AssistantToolName.Type

// A reply the server refuses to keep (out of scope, sensitive, unclear or vetoed by the output
// guard) is returned with isSaved false: it joins neither the history nor the model's context,
// and conversationId stays null when no conversation existed yet.
export const AssistantReply = Schema.Struct({
  conversationId: Schema.NullOr(Schema.String),
  isSaved: Schema.Boolean,
  userMessage: AssistantMessage,
  reply: AssistantMessage,
  toolsUsed: Schema.Array(AssistantToolName),
})

export class AssistantGroup extends HttpApiGroup.make("assistant")
  .add(
    HttpApiEndpoint.post("sendMessage", "/assistant/messages", {
      payload: SendAssistantMessagePayload,
      success: AssistantReply,
      error: [
        HttpApiError.Forbidden,
        HttpApiError.NotFound,
        AssistantRateLimited,
        AssistantUnavailable,
        HttpApiError.ServiceUnavailable,
      ],
    }).middleware(Authorization),
  )
  .add(
    HttpApiEndpoint.get("suggestions", "/assistant/suggestions", {
      success: Schema.Array(Schema.String),
      error: [HttpApiError.Forbidden, HttpApiError.ServiceUnavailable],
    }).middleware(Authorization),
  )
  .add(
    HttpApiEndpoint.get("listConversations", "/assistant/conversations", {
      success: Schema.Array(AssistantConversationSummary),
      error: [HttpApiError.Forbidden, HttpApiError.ServiceUnavailable],
    }).middleware(Authorization),
  )
  .add(
    HttpApiEndpoint.get("getConversation", "/assistant/conversations/:id", {
      params: { id: Schema.String.check(Schema.isUUID()) },
      success: AssistantConversation,
      error: [HttpApiError.Forbidden, HttpApiError.NotFound, HttpApiError.ServiceUnavailable],
    }).middleware(Authorization),
  ) {}
