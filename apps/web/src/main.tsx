import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createRouter, RouterProvider } from "@tanstack/react-router"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { ErrorScreen, PendingScreen } from "./components/layout/status-screen.tsx"
import { authQueryKey, isUnauthorized } from "./lib/auth.ts"
import { routeTree } from "./routeTree.gen.ts"
import "./styles.css"

// Skips "auth" queries: their route guards already redirect, and handling both navigated twice.
const redirectToLogin = (error: unknown) => {
  if (!isUnauthorized(error)) return
  queryClient.clear()
  void router.navigate({ to: "/login", search: { redirect: router.state.location.href } })
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (query.queryKey[0] !== authQueryKey) redirectToLogin(error)
    },
  }),
  mutationCache: new MutationCache({ onError: redirectToLogin }),
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
