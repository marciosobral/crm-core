import { queryOptions } from "@tanstack/react-query"
import { runApi } from "./api-client.ts"

export const dealsQueryKey = "deals"

export const dealDetailsQueryKey = "deal-details"

export const dealDetailsQueryOptions = (id: string) =>
  queryOptions({
    queryKey: [dealDetailsQueryKey, id],
    queryFn: () => runApi((client) => client.deals.get({ params: { id } })),
  })

export const dealsQueryOptions = (query: { search?: string; sellerId?: string }) =>
  queryOptions({
    queryKey: [dealsQueryKey, query],
    queryFn: () => runApi((client) => client.deals.list({ query })),
  })
