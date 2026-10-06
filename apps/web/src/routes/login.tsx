import { InvalidCredentials, TooManyLoginAttempts } from "@crm/contract"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router"
import { TriangleAlert } from "lucide-react"
import { type FormEvent, useEffect, useState } from "react"
import { Button } from "#src/components/ui/button.tsx"
import { Logo } from "#src/components/ui/logo.tsx"
import { TextField } from "#src/components/ui/text-field.tsx"
import { runApi } from "#src/lib/api-client.ts"
import { meQueryOptions, safeRedirect } from "#src/lib/auth.ts"

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

const formatCountdown = (millis: number) => {
  const totalSeconds = Math.max(0, Math.ceil(millis / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

function Login() {
  const { redirect: redirectTo } = Route.useSearch()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [retryAt, setRetryAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const loginMutation = useMutation({
    mutationFn: () => runApi((client) => client.auth.login({ payload: { email, password } })),
    onSuccess: (user) => {
      queryClient.setQueryData(meQueryOptions.queryKey, user)
      router.history.push(safeRedirect(redirectTo))
    },
    onError: (error) => {
      if (error instanceof TooManyLoginAttempts) {
        const current = Date.now()
        setNow(current)
        setRetryAt(current + error.retryAfterSeconds * 1000)
      }
    },
  })
  const { reset: resetLogin } = loginMutation

  useEffect(() => {
    if (retryAt === null) return
    const interval = setInterval(() => {
      const current = Date.now()
      if (current < retryAt) {
        setNow(current)
        return
      }
      setRetryAt(null)
      resetLogin()
    }, 1000)
    return () => clearInterval(interval)
  }, [retryAt, resetLogin])

  const isRateLimited = retryAt !== null

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    loginMutation.mutate()
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-6 rounded-2xl border border-line bg-surface p-6 shadow-2xl sm:p-8"
      >
        <div className="space-y-3 text-center">
          <Logo size="lg" />
          <p className="text-sm text-muted">Entre na sua conta corporativa para continuar</p>
        </div>

        <div className="space-y-4">
          <TextField
            label="E-mail profissional"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
              if (isRateLimited) {
                setRetryAt(null)
                resetLogin()
              }
            }}
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

        {isRateLimited ? (
          <div
            role="alert"
            className="flex gap-2 rounded-lg border border-warning bg-warning-surface px-3 py-2.5 text-sm text-warning"
          >
            <TriangleAlert className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <p>Muitas tentativas de login com este e-mail. Aguarde para tentar novamente.</p>
          </div>
        ) : (
          loginMutation.isError && (
            <p role="alert" className="text-sm text-red-400">
              {loginMutation.error instanceof InvalidCredentials
                ? "E-mail ou senha inválidos."
                : "Não foi possível entrar. Tente novamente."}
            </p>
          )
        )}

        <Button
          type="submit"
          disabled={loginMutation.isPending || isRateLimited}
          className="w-full py-2.5"
        >
          {loginMutation.isPending
            ? "Entrando..."
            : isRateLimited
              ? `Tente novamente em ${formatCountdown(retryAt - now)}`
              : "Entrar no CRM"}
        </Button>
      </form>
    </main>
  )
}
