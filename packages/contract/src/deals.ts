import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiError, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi"
import { Authorization } from "./auth.ts"
import { Seller } from "./sellers.ts"

export const DealStatus = Schema.Literals([
  "NEW",
  "CONTACTED",
  "PROPOSAL_SENT",
  "NEGOTIATION",
  "WON",
  "LOST",
])
export type DealStatus = typeof DealStatus.Type

export const OpenDealStatus = Schema.Literals(["NEW", "CONTACTED", "PROPOSAL_SENT", "NEGOTIATION"])
export type OpenDealStatus = typeof OpenDealStatus.Type

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
}) {}

const isCalendarDate = (text: string) => {
  const date = new Date(`${text}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text
}

export const CreateDealPayload = Schema.Struct({
  title: Schema.Trim.check(Schema.isNonEmpty(), Schema.isMaxLength(120)),
  leadId: Schema.String.check(Schema.isUUID()),
  sellerId: Schema.optionalKey(Schema.String.check(Schema.isUUID())),
  valueCents: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 99_999_999_999 })),
  status: OpenDealStatus,
  expectedCloseDate: Schema.optionalKey(
    Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/), Schema.makeFilter(isCalendarDate)),
  ),
  description: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(2000))),
})
export type CreateDealPayload = typeof CreateDealPayload.Type

export const ListDealsQuery = Schema.Struct({
  search: Schema.optionalKey(Schema.Trim.check(Schema.isMaxLength(100))),
  sellerId: Schema.optionalKey(Schema.String.check(Schema.isUUID())),
})

export const MoveDealPayload = Schema.Struct({ status: OpenDealStatus })

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
    HttpApiEndpoint.patch("move", "/deals/:id/status", {
      params: { id: Schema.String.check(Schema.isUUID()) },
      payload: MoveDealPayload,
      success: Deal,
      error: [
        HttpApiError.Forbidden,
        HttpApiError.NotFound,
        DealClosed,
        HttpApiError.ServiceUnavailable,
      ],
    }).middleware(Authorization),
  ) {}
