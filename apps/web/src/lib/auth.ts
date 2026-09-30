import { queryOptions } from "@tanstack/react-query"
import { Predicate } from "effect"
import { runApi } from "./api-client.ts"

export const meQueryOptions = queryOptions({
  queryKey: ["auth", "me"],
  queryFn: () => runApi((client) => client.auth.me()),
  retry: false,
  staleTime: Number.POSITIVE_INFINITY,
})

export const isUnauthorized = (error: unknown) => Predicate.isTagged(error, "Unauthorized")

export const isInvalidCredentials = (error: unknown) =>
  Predicate.isTagged(error, "InvalidCredentials")
