import type { DealActivity } from "@crm/contract"
import { type QueryClient, queryOptions } from "@tanstack/react-query"
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

export const dealsQueryOptions = (query: { search?: string; sellerId?: string }) =>
  queryOptions({
    queryKey: [dealsQueryKey, query],
    queryFn: () => runApi((client) => client.deals.list({ query })),
  })
