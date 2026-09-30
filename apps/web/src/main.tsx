import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createRouter, RouterProvider } from "@tanstack/react-router"
import { HttpApiError } from "effect/unstable/httpapi"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { ErrorScreen, PendingScreen } from "./components/layout/status-screen.tsx"
import { authQueryKey } from "./lib/auth.ts"
import { routeTree } from "./routeTree.gen.ts"
import "./styles.css"

// The history location changes synchronously on navigate, unlike router.state, so concurrent 401s do not overwrite the redirect target with /login.
const redirectToLogin = (error: unknown) => {
  if (
    !(error instanceof HttpApiError.Unauthorized) ||
    router.history.location.pathname === "/login"
  )
    return
  queryClient.clear()
  void router.navigate({ to: "/login", search: { redirect: router.history.location.href } })
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retrying a 401 only delays the login redirect (and retries pause while the tab is hidden).
      retry: (failureCount, error) =>
        !(error instanceof HttpApiError.Unauthorized) && failureCount < 3,
    },
  },
  // Skips "auth" queries and mutations: their route guards and handlers already navigate, and handling both navigated twice.
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (query.queryKey[0] !== authQueryKey) redirectToLogin(error)
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _onMutateResult, mutation) => {
      if (mutation.options.mutationKey?.[0] !== authQueryKey) redirectToLogin(error)
    },
  }),
})
const router = createRouter({
  routeTree,
  context: { queryClient },
  // The API may be waking up (Render free tier), so show progress instead of a blank page.
  defaultPendingComponent: PendingScreen,
  defaultPendingMs: 500,
  defaultErrorComponent: ErrorScreen,
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById("root")
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  )
}
