import { type DealActivity, DealFilters, ListDealsQuery } from "@crm/contract"
import { type QueryClient, queryOptions } from "@tanstack/react-query"
import { Option, Schema } from "effect"
import { HttpApiError } from "effect/unstable/httpapi"
import { runApi, shouldRetryQuery } from "./api-client.ts"
import { formatRelative } from "./format.ts"
import { leadsQueryKey } from "./leads.ts"

export const dealsQueryKey = "deals"

export const dealDetailsQueryKey = "deal-details"

export const dealActivitiesQueryKey = "deal-activities"

// A deal change shows up on the board, in its details and timeline, and in the lead's derived status and last interaction.
export const invalidateDealQueries = (queryClient: QueryClient) =>
  Promise.all(
    [dealsQueryKey, dealDetailsQueryKey, dealActivitiesQueryKey, leadsQueryKey].map((key) =>
      queryClient.invalidateQueries({ queryKey: [key] }),
    ),
  )

// A missing deal stays missing, so retrying only delays the "not found" state.
const retryUnlessNotFound = (failureCount: number, error: Error) =>
  !(error instanceof HttpApiError.NotFound) && shouldRetryQuery(failureCount, error)

export const dealDetailsQueryOptions = (id: string) =>
  queryOptions({
    queryKey: [dealDetailsQueryKey, id],
    queryFn: () => runApi((client) => client.deals.get({ params: { id } })),
    retry: retryUnlessNotFound,
  })

export const dealActivitiesQueryOptions = (id: string) =>
  queryOptions({
    queryKey: [dealActivitiesQueryKey, id],
    queryFn: () => runApi((client) => client.deals.listActivities({ params: { id } })),
    retry: retryUnlessNotFound,
  })

export const lastContactLabel = (
  activities: ReadonlyArray<DealActivity> | undefined,
  isError: boolean,
) => {
  if (isError) return "Indisponível"
  if (!activities) return "Carregando..."
  const [latest] = activities
  return latest ? formatRelative(latest.createdAt, "short") : "Sem interação"
}

export const dealsQueryOptions = (filters: DealFilters) =>
  queryOptions({
    queryKey: [dealsQueryKey, filters],
    queryFn: () => runApi((client) => client.deals.list({ query: filters })),
  })

// Each URL param is decoded on its own so one bad value (typed by hand, or from an old link) drops only that filter.
// An inverted range would be a 400, so only that pair is dropped.
const rangePairs = [
  ["minValueCents", "maxValueCents"],
  ["closeFrom", "closeTo"],
  ["closedFrom", "closedTo"],
]

const decodeFilters = Schema.decodeUnknownOption(DealFilters)

export const filtersFromSearch = (search: Record<string, unknown>): DealFilters => {
  const fields = new Map<string, unknown>()
  for (const [key, field] of Object.entries(ListDealsQuery.fields)) {
    const decoded = Schema.decodeUnknownOption(Schema.Struct({ [key]: field }))({
      [key]: search[key],
    })
    if (Option.isNone(decoded)) continue
    for (const [decodedKey, value] of Object.entries(decoded.value)) fields.set(decodedKey, value)
  }
  for (const pair of rangePairs) {
    const presentKeys = pair.filter((key) => fields.has(key))
    const pairFilters = Object.fromEntries(presentKeys.map((key) => [key, fields.get(key)]))
    const isPairValid = Option.isSome(decodeFilters(pairFilters))
    if (!isPairValid) for (const key of pair) fields.delete(key)
  }
  return Option.getOrElse(decodeFilters(Object.fromEntries(fields)), () => ({}))
}

export const searchFromFilters = (filters: DealFilters) =>
  Schema.encodeSync(ListDealsQuery)(filters)
