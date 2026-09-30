import { queryOptions } from "@tanstack/react-query"
import { runApi } from "./api-client.ts"

export const leadsQueryKey = "leads"

export const leadsQueryOptions = (query: { search?: string; sellerId?: string }) =>
  queryOptions({
    queryKey: [leadsQueryKey, query],
    queryFn: () => runApi((client) => client.leads.list({ query })),
  })

export const sellersQueryOptions = queryOptions({
  queryKey: ["sellers"],
  queryFn: () => runApi((client) => client.sellers.list()),
  staleTime: 5 * 60_000,
})
