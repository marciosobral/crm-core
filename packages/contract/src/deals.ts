import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiError, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi"
import { AssistantRateLimited, AssistantUnavailable } from "./assistant.ts"
import { Authorization } from "./auth.ts"
import { CalendarDate } from "./dates.ts"
import { ListDealsQuery } from "./deal-filters.ts"
import { DealStatus, dealStatusLabels, OpenDealStatus } from "./deal-status.ts"
import { Lead } from "./leads.ts"
import { Seller } from "./sellers.ts"
import { requiredText, trimmedText } from "./text.ts"

export const LostReason = Schema.Literals([
  "PRICE",
  "COMPETITOR",
  "NO_BUDGET",
  "NO_RESPONSE",
  "GAVE_UP",
  "OTHER",
])
export type LostReason = typeof LostReason.Type

export const lostReasonLabels: Record<LostReason, string> = {
  PRICE: "Preço",
  COMPETITOR: "Concorrente",
  NO_BUDGET: "Sem orçamento",
  NO_RESPONSE: "Sem resposta",
  GAVE_UP: "Desistiu",
  OTHER: "Outro",
}

export class DealLead extends Schema.Class<DealLead>("DealLead")({
  id: Schema.String,
  name: Schema.String,
  company: Schema.String,
}) {}

export class Deal extends Schema.Class<Deal>("Deal")({
  id: Schema.String,
  title: Schema.String,
  valueCents: Schema.Int,
  status: DealStatus,
  expectedCloseDate: Schema.NullOr(Schema.String),
  description: Schema.NullOr(Schema.String),
  lead: DealLead,
  seller: Seller,
  createdAt: Schema.DateTimeUtcFromString,
  lostReason: Schema.NullOr(LostReason),
  lostNote: Schema.NullOr(Schema.String),
  closedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
}) {}

export const CreateDealPayload = Schema.Struct({
  title: requiredText(120),
  leadId: Schema.String.check(Schema.isUUID()),
  sellerId: Schema.optionalKey(Schema.String.check(Schema.isUUID())),
  valueCents: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 99_999_999_999 })),
  status: OpenDealStatus,
  expectedCloseDate: Schema.optionalKey(CalendarDate),
  description: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(2000))),
})
export type CreateDealPayload = typeof CreateDealPayload.Type

export const MoveDealPayload = Schema.Struct({ status: OpenDealStatus })

export const CloseDealPayload = Schema.Union([
  Schema.Struct({ result: Schema.Literal("WON") }),
  Schema.Struct({
    result: Schema.Literal("LOST"),
    reason: LostReason,
    note: Schema.optionalKey(trimmedText(500)),
  }).check(
    Schema.makeFilter(
      ({ reason, note }) => reason !== "OTHER" || (note !== undefined && note !== ""),
      { title: "note is required when the reason is OTHER" },
    ),
  ),
])
export type CloseDealPayload = typeof CloseDealPayload.Type

export class DealDetails extends Schema.Class<DealDetails>("DealDetails")({
  deal: Deal,
  lead: Lead,
}) {}

const activityFields = {
  id: Schema.String,
  author: Seller,
  createdAt: Schema.DateTimeUtcFromString,
}

export const DealComment = Schema.Struct({
  kind: Schema.Literal("COMMENT"),
  ...activityFields,
  body: Schema.String,
})
export type DealComment = typeof DealComment.Type

export const DealActivity = Schema.Union([
  DealComment,
  Schema.Struct({ kind: Schema.Literal("CREATED"), ...activityFields }),
  Schema.Struct({ kind: Schema.Literal("SELLER_ASSIGNED"), ...activityFields, seller: Seller }),
  Schema.Struct({
    kind: Schema.Literal("STATUS_CHANGED"),
    ...activityFields,
    status: OpenDealStatus,
  }),
  Schema.Struct({ kind: Schema.Literal("WON"), ...activityFields }),
  Schema.Struct({ kind: Schema.Literal("LOST"), ...activityFields, lostReason: LostReason }),
])
export type DealActivity = typeof DealActivity.Type

// The activity as the timeline shows it, with the author left to the caller.
export const describeDealActivity = (activity: DealActivity) => {
  switch (activity.kind) {
    case "COMMENT":
      return activity.body
    case "CREATED":
      return "Negócio criado"
    case "SELLER_ASSIGNED":
      return `Vendedor ${activity.seller.name} atribuído ao negócio`
    case "STATUS_CHANGED":
      return `Status alterado para ${dealStatusLabels[activity.status]}`
    case "WON":
      return "Negócio marcado como ganho"
    case "LOST":
      return `Negócio marcado como perdido: ${lostReasonLabels[activity.lostReason]}`
  }
}

export const commentMaxLength = 2000

export const AddDealCommentPayload = Schema.Struct({
  body: requiredText(commentMaxLength),
})

export const DealNextStep = Schema.Struct({ action: Schema.String, reason: Schema.String })
export type DealNextStep = typeof DealNextStep.Type

export class InvalidDealLead extends Schema.TaggedError<InvalidDealLead>()(
  "InvalidDealLead",
  {},
  { httpApiStatus: 422 },
) {}

export class InvalidDealSeller extends Schema.TaggedError<InvalidDealSeller>()(
  "InvalidDealSeller",
  {},
  { httpApiStatus: 422 },
) {}

export class DealClosed extends Schema.TaggedError<DealClosed>()(
  "DealClosed",
  {},
  { httpApiStatus: 409 },
) {}

const DealIdParams = { id: Schema.String.check(Schema.isUUID()) }

export class DealsGroup extends HttpApiGroup.make("deals")
  .add(
    HttpApiEndpoint.get("list", "/deals", {
      query: ListDealsQuery,
      success: Schema.Array(Deal),
      error: HttpApiError.ServiceUnavailable,
    }).middleware(Authorization),
  )
  .add(
    HttpApiEndpoint.post("create", "/deals", {
      payload: CreateDealPayload,
      success: Deal.pipe(HttpApiSchema.status(201)),
      error: [
        HttpApiError.Forbidden,
        InvalidDealLead,
        InvalidDealSeller,
        HttpApiError.ServiceUnavailable,
      ],
    }).middleware(Authorization),
  )
  .add(
    HttpApiEndpoint.get("get", "/deals/:id", {
      params: DealIdParams,
      success: DealDetails,
      error: [HttpApiError.NotFound, HttpApiError.ServiceUnavailable],
    }).middleware(Authorization),
  )
  .add(
    HttpApiEndpoint.patch("move", "/deals/:id/status", {
      params: DealIdParams,
      payload: MoveDealPayload,
      success: Deal,
      error: [
        HttpApiError.Forbidden,
        HttpApiError.NotFound,
        DealClosed,
        HttpApiError.ServiceUnavailable,
      ],
    }).middleware(Authorization),
  )
  .add(
    HttpApiEndpoint.post("close", "/deals/:id/close", {
      params: DealIdParams,
      payload: CloseDealPayload,
      success: Deal,
      error: [
        HttpApiError.Forbidden,
        HttpApiError.NotFound,
        DealClosed,
        HttpApiError.ServiceUnavailable,
      ],
    }).middleware(Authorization),
  )
  .add(
    HttpApiEndpoint.get("listActivities", "/deals/:id/activities", {
      params: DealIdParams,
      success: Schema.Array(DealActivity),
      error: [HttpApiError.NotFound, HttpApiError.ServiceUnavailable],
    }).middleware(Authorization),
  )
  .add(
    HttpApiEndpoint.post("comment", "/deals/:id/comments", {
      params: DealIdParams,
      payload: AddDealCommentPayload,
      success: DealComment.pipe(HttpApiSchema.status(201)),
      error: [HttpApiError.Forbidden, HttpApiError.NotFound, HttpApiError.ServiceUnavailable],
    }).middleware(Authorization),
  )
  .add(
    HttpApiEndpoint.post("suggestNextStep", "/deals/:id/next-step", {
      params: DealIdParams,
      success: DealNextStep,
      error: [
        HttpApiError.Forbidden,
        HttpApiError.NotFound,
        DealClosed,
        AssistantRateLimited,
        AssistantUnavailable,
        HttpApiError.ServiceUnavailable,
      ],
    }).middleware(Authorization),
  ) {}
