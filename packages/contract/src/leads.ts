import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiError, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi"
import { Authorization } from "./auth.ts"
import { DealStatus } from "./deal-status.ts"
import { Seller } from "./sellers.ts"

export const LeadSource = Schema.Literals([
  "WEBSITE",
  "REFERRAL",
  "SOCIAL_MEDIA",
  "EVENT",
  "OUTBOUND",
  "STORE",
  "OTHER",
])
export type LeadSource = typeof LeadSource.Type

export class LeadLastActivity extends Schema.Class<LeadLastActivity>("LeadLastActivity")({
  at: Schema.DateTimeUtcFromString,
  authorName: Schema.String,
}) {}

export class Lead extends Schema.Class<Lead>("Lead")({
  id: Schema.String,
  name: Schema.String,
  company: Schema.String,
  email: Schema.String,
  phone: Schema.String,
  jobTitle: Schema.NullOr(Schema.String),
  source: LeadSource,
  notes: Schema.NullOr(Schema.String),
  seller: Seller,
  status: DealStatus,
  createdAt: Schema.DateTimeUtcFromString,
  lastActivity: Schema.NullOr(LeadLastActivity),
}) {}

const trimmedText = (max: number) => Schema.Trim.check(Schema.isMaxLength(max))
const requiredText = (max: number) =>
  Schema.Trim.check(Schema.isNonEmpty(), Schema.isMaxLength(max))

export const CreateLeadPayload = Schema.Struct({
  name: requiredText(120),
  company: requiredText(120),
  email: Schema.Trim.check(Schema.isMaxLength(254), Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
  phone: Schema.String.check(Schema.isPattern(/^[0-9]{10,11}$/)),
  jobTitle: Schema.optionalKey(trimmedText(120)),
  source: LeadSource,
  notes: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(2000))),
  sellerId: Schema.optionalKey(Schema.String.check(Schema.isUUID())),
})
export type CreateLeadPayload = typeof CreateLeadPayload.Type

export const ListLeadsQuery = Schema.Struct({
  search: Schema.optionalKey(trimmedText(100)),
  sellerId: Schema.optionalKey(Schema.String.check(Schema.isUUID())),
  status: Schema.optionalKey(DealStatus),
})

export class InvalidLeadSeller extends Schema.TaggedError<InvalidLeadSeller>()(
  "InvalidLeadSeller",
  {},
  { httpApiStatus: 422 },
) {}

export class LeadsGroup extends HttpApiGroup.make("leads")
  .add(
    HttpApiEndpoint.get("list", "/leads", {
      query: ListLeadsQuery,
      success: Schema.Array(Lead),
      error: HttpApiError.ServiceUnavailable,
    }).middleware(Authorization),
  )
  .add(
    HttpApiEndpoint.post("create", "/leads", {
      payload: CreateLeadPayload,
      success: Lead.pipe(HttpApiSchema.status(201)),
      error: [HttpApiError.Forbidden, InvalidLeadSeller, HttpApiError.ServiceUnavailable],
    }).middleware(Authorization),
  ) {}
