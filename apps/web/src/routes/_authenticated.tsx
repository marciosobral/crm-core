import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Outlet, redirect, useRouter } from "@tanstack/react-router"
import { HttpApiError } from "effect/unstable/httpapi"
import { AppShell } from "#src/components/layout/app-shell.tsx"
import { UserFooter } from "#src/components/layout/user-footer.tsx"
import { runApi } from "#src/lib/api-client.ts"
import { authQueryKey, meQueryOptions } from "#src/lib/auth.ts"

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: ({ context, location }) =>
    context.queryClient.ensureQueryData(meQueryOptions).catch((error: unknown) => {
      if (error instanceof HttpApiError.Unauthorized)
        throw redirect({ to: "/login", search: { redirect: location.href } })
      throw error
    }),
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  const { data: user } = useSuspenseQuery(meQueryOptions)
  const queryClient = useQueryClient()
  const router = useRouter()

  const logoutMutation = useMutation({
    mutationKey: [authQueryKey, "logout"],
    mutationFn: () => runApi((client) => client.auth.logout()),
    // Signing out locally must not depend on the API call succeeding.
    onSettled: () => {
      queryClient.clear()
      void router.navigate({ to: "/login" })
    },
  })

  return (
    <AppShell
      footer={
        <UserFooter
          user={user}
          onLogout={() => logoutMutation.mutate()}
          isLoggingOut={logoutMutation.isPending}
        />
      }
    >
      <Outlet />
    </AppShell>
  )
}
