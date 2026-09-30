import { queryOptions } from "@tanstack/react-query"
import { HttpApiError } from "effect/unstable/httpapi"
import { runApi } from "./api-client.ts"

export const dealsQueryKey = "deals"

export const dealDetailsQueryKey = "deal-details"

export const dealDetailsQueryOptions = (id: string) =>
  queryOptions({
    queryKey: [dealDetailsQueryKey, id],
    queryFn: () => runApi((client) => client.deals.get({ params: { id } })),
    // A missing deal stays missing, so retrying only delays the "not found" state.
    retry: (failureCount, error) => !(error instanceof HttpApiError.NotFound) && failureCount < 3,
  })

export const dealsQueryOptions = (query: { search?: string; sellerId?: string }) =>
  queryOptions({
    queryKey: [dealsQueryKey, query],
    queryFn: () => runApi((client) => client.deals.list({ query })),
  })
