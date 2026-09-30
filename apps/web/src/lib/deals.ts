import { queryOptions } from "@tanstack/react-query"
import { runApi } from "./api-client.ts"

export const dealsQueryKey = "deals"

export const dealsQueryOptions = (query: { search?: string; sellerId?: string }) =>
  queryOptions({
    queryKey: [dealsQueryKey, query],
    queryFn: () => runApi((client) => client.deals.list({ query })),
  })
