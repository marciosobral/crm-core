import { useRouter } from "@tanstack/react-router"

export function PendingScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center text-sm text-zinc-400">
      Carregando...
    </main>
  )
}

export function ErrorScreen() {
  const router = useRouter()

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-sm text-zinc-300">Não foi possível carregar. Tente novamente.</p>
      <button
        type="button"
        onClick={() => void router.invalidate()}
        className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        Tentar novamente
      </button>
    </main>
  )
}
