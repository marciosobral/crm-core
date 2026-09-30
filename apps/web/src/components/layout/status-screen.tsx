import { useRouter } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { Button } from "../ui/button.tsx"

type StatusScreenProps = { message: string; action?: ReactNode }

function StatusScreen({ message, action }: StatusScreenProps) {
  return action ? (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-sm text-zinc-300">{message}</p>
      {action}
    </div>
  ) : (
    <div className="flex flex-1 items-center justify-center text-sm text-muted">{message}</div>
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
