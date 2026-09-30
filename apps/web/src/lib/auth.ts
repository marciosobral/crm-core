import { queryOptions } from "@tanstack/react-query"
import { runApi } from "./api-client.ts"

export const authQueryKey = "auth"

export const meQueryOptions = queryOptions({
  queryKey: [authQueryKey, "me"],
  queryFn: () => runApi((client) => client.auth.me()),
  retry: false,
  staleTime: Number.POSITIVE_INFINITY,
})
