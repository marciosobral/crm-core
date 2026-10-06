import { queryOptions } from "@tanstack/react-query"
import { runApi } from "./api-client.ts"

export const authQueryKey = "auth"

export const meQueryOptions = queryOptions({
  queryKey: [authQueryKey, "me"],
  queryFn: () => runApi((client) => client.auth.me()),
  retry: false,
  staleTime: Number.POSITIVE_INFINITY,
})

// Only same-app paths are allowed after login; "//host" and "/\host" would leave the site and /login would loop.
export const safeRedirect = (target: string | undefined) =>
  target?.startsWith("/") &&
  !target.startsWith("//") &&
  !target.startsWith("/\\") &&
  !target.startsWith("/login")
    ? target
    : "/"
