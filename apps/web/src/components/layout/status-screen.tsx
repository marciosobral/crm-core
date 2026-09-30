import { useRouter } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { Button } from "../ui/button.tsx"

type StatusScreenProps = { message: string; action?: ReactNode }

function StatusScreen({ message, action }: StatusScreenProps) {
  return action ? (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-sm text-zinc-300">{message}</p>
      {action}
    </main>
  ) : (
    <main className="flex min-h-screen items-center justify-center text-sm text-zinc-400">
      {message}
    </main>
  )
}

export function PendingScreen() {
  return <StatusScreen message="Carregando..." />
}

export function ErrorScreen() {
  const router = useRouter()

  return (
    <StatusScreen
      message="Não foi possível carregar. Tente novamente."
      action={<Button onClick={() => void router.invalidate()}>Tentar novamente</Button>}
    />
  )
}
