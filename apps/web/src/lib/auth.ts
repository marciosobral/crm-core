import { InvalidCredentials } from "@crm/contract"
import { queryOptions } from "@tanstack/react-query"
import { HttpApiError } from "effect/unstable/httpapi"
import { runApi } from "./api-client.ts"

export const authQueryKey = "auth"

export const meQueryOptions = queryOptions({
  queryKey: [authQueryKey, "me"],
  queryFn: () => runApi((client) => client.auth.me()),
  retry: false,
  staleTime: Number.POSITIVE_INFINITY,
})

export const isUnauthorized = (error: unknown) => error instanceof HttpApiError.Unauthorized

export const isInvalidCredentials = (error: unknown) => error instanceof InvalidCredentials
