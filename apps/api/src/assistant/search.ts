import { DealFilters, DealStatus, ListLeadsQuery, type Seller } from "@crm/contract"
import { Effect, Option, Schema } from "effect"
import { dieOnSchemaError } from "#src/platform/sql.ts"
import { type DateRange, Period, resolvePeriod } from "./periods.ts"
import { resolveSeller } from "./sellers.ts"

export const DealSearchArguments = Schema.Struct({
  statuses: Schema.NullOr(Schema.Array(DealStatus)),
  minValueCents: Schema.NullOr(Schema.Number),
  maxValueCents: Schema.NullOr(Schema.Number),
  idleDays: Schema.NullOr(Schema.Number),
  expectedClose: Schema.NullOr(Period),
  closed: Schema.NullOr(Period),
  sellerName: Schema.NullOr(Schema.String),
  search: Schema.NullOr(Schema.String),
})
export type DealSearchArguments = typeof DealSearchArguments.Type

// ME is the current user's own deals and leads; TEAM is everything the user's scope allows.
export const Owner = Schema.Literals(["ME", "TEAM"])
export type Owner = typeof Owner.Type

export const IgnoredFilter = Schema.Literals([
  "INVALID_VALUE",
  "INVALID_PERIOD",
  "INVERTED_RANGE",
  "PERIOD_NOT_APPLICABLE",
  "UNKNOWN_SELLER",
  "AMBIGUOUS_SELLER",
  "SELLER_FILTER_UNAVAILABLE",
])
export type IgnoredFilter = typeof IgnoredFilter.Type

interface SearchResult {
  readonly filters: DealFilters
  readonly ignored: ReadonlyArray<IgnoredFilter>
}

export interface SearchContext {
  readonly today: string
  readonly sellers: ReadonlyArray<Seller>
  readonly canFilterBySeller: boolean
}

const decodeFilters = Schema.decodeUnknownOption(DealFilters)
const decodeFiltersEffect = Schema.decodeUnknownEffect(DealFilters)
const decodeLeadQuery = Schema.decodeUnknownEffect(ListLeadsQuery)
const decodeLeadQueryOption = Schema.decodeUnknownOption(ListLeadsQuery)

const isValidFilter = (key: string, value: unknown) =>
  Option.isSome(decodeFilters({ [key]: value }))

const sellerFilterFor = (
  sellerName: string | null,
  { sellers, canFilterBySeller }: SearchContext,
): { readonly sellerId?: string; readonly ignored?: IgnoredFilter } => {
  if (sellerName === null || sellerName.trim() === "") return {}
  if (!canFilterBySeller) return { ignored: "SELLER_FILTER_UNAVAILABLE" }
  const match = resolveSeller(sellerName, sellers)
  if (match._tag === "Found") return { sellerId: match.id }
  return { ignored: match._tag === "Unknown" ? "UNKNOWN_SELLER" : "AMBIGUOUS_SELLER" }
}

// Builds valid deal filters from the tool arguments. Every piece is validated on its own so one bad
// value only drops that piece. The candidate is decoded through DealFilters as a last check: the
// pieces above make a failure there a bug, so it becomes a defect.
export const toSearchFilters = (
  args: DealSearchArguments,
  context: SearchContext,
): Effect.Effect<SearchResult> => {
  const candidate: Record<string, unknown> = {}
  const ignored = new Set<IgnoredFilter>()

  const takeValue = (key: string, value: number | null) => {
    if (value === null) return
    if (isValidFilter(key, value)) candidate[key] = value
    else ignored.add("INVALID_VALUE")
  }

  const takeRange = (fromKey: string, toKey: string, range: DateRange | null) => {
    if (range === null) {
      ignored.add("INVALID_PERIOD")
      return
    }
    if (range.from !== undefined && range.to !== undefined && range.from > range.to) {
      ignored.add("INVERTED_RANGE")
      return
    }
    if (range.from !== undefined) candidate[fromKey] = range.from
    if (range.to !== undefined) candidate[toKey] = range.to
  }

  if (args.statuses !== null && args.statuses.length > 0)
    candidate.statuses = [...new Set(args.statuses)]

  takeValue("idleDays", args.idleDays)
  const { minValueCents, maxValueCents } = args
  const isInvertedValueRange =
    minValueCents !== null &&
    maxValueCents !== null &&
    isValidFilter("minValueCents", minValueCents) &&
    isValidFilter("maxValueCents", maxValueCents) &&
    minValueCents > maxValueCents
  if (isInvertedValueRange) {
    ignored.add("INVERTED_RANGE")
  } else {
    takeValue("minValueCents", minValueCents)
    takeValue("maxValueCents", maxValueCents)
  }

  if (args.expectedClose !== null)
    takeRange("closeFrom", "closeTo", resolvePeriod(args.expectedClose, context.today))
  if (args.closed !== null)
    takeRange("closedFrom", "closedTo", resolvePeriod(args.closed, context.today))

  const seller = sellerFilterFor(args.sellerName, context)
  if (seller.sellerId !== undefined) candidate.sellerId = seller.sellerId
  if (seller.ignored !== undefined) ignored.add(seller.ignored)

  const text = args.search?.trim()
  if (text !== undefined && text !== "") {
    if (isValidFilter("search", text)) candidate.search = text
    else ignored.add("INVALID_VALUE")
  }

  return decodeFiltersEffect(candidate).pipe(
    Effect.map((filters) => ({ filters, ignored: [...ignored] })),
    dieOnSchemaError,
  )
}

export const noDealSearch: DealSearchArguments = {
  statuses: null,
  minValueCents: null,
  maxValueCents: null,
  idleDays: null,
  expectedClose: null,
  closed: null,
  sellerName: null,
  search: null,
}

export const LeadSearchArguments = Schema.Struct({
  status: Schema.NullOr(DealStatus),
  sellerName: Schema.NullOr(Schema.String),
  search: Schema.NullOr(Schema.String),
})
export type LeadSearchArguments = typeof LeadSearchArguments.Type

// The lead list query for the tool arguments, with the same drop-and-report rule as the deal filters.
export const toLeadQuery = (
  args: LeadSearchArguments,
  context: SearchContext,
): Effect.Effect<{
  readonly query: typeof ListLeadsQuery.Type
  readonly ignored: ReadonlyArray<IgnoredFilter>
}> => {
  const ignored: Array<IgnoredFilter> = []
  const seller = sellerFilterFor(args.sellerName, context)
  if (seller.ignored !== undefined) ignored.push(seller.ignored)
  const text = args.search?.trim() ?? ""
  const hasSearch = text !== "" && Option.isSome(decodeLeadQueryOption({ search: text }))
  if (text !== "" && !hasSearch) ignored.push("INVALID_VALUE")
  return decodeLeadQuery({
    ...(hasSearch ? { search: text } : {}),
    ...(seller.sellerId === undefined ? {} : { sellerId: seller.sellerId }),
    ...(args.status === null ? {} : { status: args.status }),
  }).pipe(
    Effect.map((query) => ({ query, ignored })),
    dieOnSchemaError,
  )
}
