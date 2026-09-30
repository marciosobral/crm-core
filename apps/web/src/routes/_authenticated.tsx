import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Outlet, redirect, useRouter } from "@tanstack/react-router"
import { Logo } from "../components/logo.tsx"
import { runApi } from "../lib/api-client.ts"
import { isUnauthorized, meQueryOptions } from "../lib/auth.ts"

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: ({ context, location }) =>
    context.queryClient.ensureQueryData(meQueryOptions).catch((error: unknown) => {
      if (isUnauthorized(error))
        throw redirect({ to: "/login", search: { redirect: location.href } })
      throw error
    }),
  component: AuthenticatedLayout,
})

const initialsOf = (name: string) =>
  name
    .split(" ")
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("")

function AuthenticatedLayout() {
  const { data: user } = useSuspenseQuery(meQueryOptions)
  const queryClient = useQueryClient()
  const router = useRouter()

  const logoutMutation = useMutation({
    mutationFn: () => runApi((client) => client.auth.logout()),
    // Signing out locally must not depend on the API call succeeding.
    onSettled: () => {
      queryClient.clear()
      void router.navigate({ to: "/login" })
    },
  })

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-surface">
        <div className="px-6 py-6">
          <Logo />
        </div>
        <nav className="flex-1 px-3" aria-label="Navegação principal" />
        <div className="flex items-center gap-3 border-t border-line px-4 py-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white">
            {initialsOf(user.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-zinc-400">{user.email}</p>
          </div>
          <button
            type="button"
            aria-label="Sair"
            title="Sair"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            className="rounded-md p-1.5 text-zinc-400 hover:bg-line hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-brand"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </button>
        </div>
      </aside>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
