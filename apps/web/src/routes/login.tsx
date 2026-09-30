import { TooManyLoginAttempts } from "@crm/contract"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router"
import { type FormEvent, useState } from "react"
import { Button } from "../components/ui/button.tsx"
import { Logo } from "../components/ui/logo.tsx"
import { TextField } from "../components/ui/text-field.tsx"
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
          <Logo size="lg" />
          <p className="text-sm text-zinc-400">Entre na sua conta corporativa para continuar</p>
        </div>

        <div className="space-y-4">
          <TextField
            label="E-mail profissional"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <TextField
            label="Senha"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
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

        <Button type="submit" disabled={loginMutation.isPending} className="w-full py-2.5">
          {loginMutation.isPending ? "Entrando..." : "Entrar no CRM"}
        </Button>
      </form>
    </main>
  )
}
