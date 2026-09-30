import { TooManyLoginAttempts } from "@crm/contract"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router"
import { type FormEvent, useState } from "react"
import { Logo } from "../components/logo.tsx"
import { runApi } from "../lib/api-client.ts"
import { isInvalidCredentials, meQueryOptions } from "../lib/auth.ts"
import { safeRedirect } from "../lib/safe-redirect.ts"

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } =>
    typeof search.redirect === "string" ? { redirect: search.redirect } : {},
  beforeLoad: async ({ context, search }) => {
    const isLoggedIn = await context.queryClient.fetchQuery(meQueryOptions).then(
      () => true,
      () => false,
    )
    if (isLoggedIn) throw redirect({ href: safeRedirect(search.redirect) })
  },
  component: Login,
})

function Login() {
  const { redirect: redirectTo } = Route.useSearch()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  const loginMutation = useMutation({
    mutationFn: () => runApi((client) => client.auth.login({ payload: { email, password } })),
    onSuccess: (user) => {
      queryClient.setQueryData(meQueryOptions.queryKey, user)
      router.history.push(safeRedirect(redirectTo))
    },
  })

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    loginMutation.mutate()
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-6 rounded-2xl border border-line bg-surface p-8 shadow-2xl"
      >
        <div className="space-y-3 text-center">
          <Logo />
          <p className="text-sm text-zinc-400">Entre na sua conta corporativa para continuar</p>
        </div>

        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-zinc-400">
              E-mail profissional <span className="text-brand">*</span>
            </span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm outline-none focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/40"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-zinc-400">
              Senha <span className="text-brand">*</span>
            </span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm outline-none focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/40"
            />
          </label>
        </div>

        {loginMutation.isError && (
          <p role="alert" className="text-sm text-red-400">
            {loginMutation.error instanceof TooManyLoginAttempts
              ? `Muitas tentativas. Tente novamente em ${Math.ceil(loginMutation.error.retryAfterSeconds / 60)} minuto(s).`
              : isInvalidCredentials(loginMutation.error)
                ? "E-mail ou senha inválidos."
                : "Não foi possível entrar. Tente novamente."}
          </p>
        )}

        <button
          type="submit"
          disabled={loginMutation.isPending}
          className="w-full rounded-lg bg-brand py-2.5 text-sm font-semibold text-white hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60"
        >
          {loginMutation.isPending ? "Entrando..." : "Entrar no CRM"}
        </button>
      </form>
    </main>
  )
}
