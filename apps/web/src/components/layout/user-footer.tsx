import type { Role } from "@crm/contract"
import { LogOut } from "lucide-react"
import { roleLabels } from "../../lib/labels.ts"
import { Button } from "../ui/button.tsx"

type UserFooterProps = {
  user: { name: string; role: Role }
  onLogout: () => void
  isLoggingOut: boolean
}

const initialsOf = (name: string) =>
  name
    .split(" ")
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("")

export function UserFooter({ user, onLogout, isLoggingOut }: UserFooterProps) {
  return (
    <div className="flex items-center gap-3 border-t border-line pt-5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white">
        {initialsOf(user.name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{user.name}</p>
        <p className="truncate text-xs text-muted">{roleLabels[user.role]}</p>
      </div>
      <Button
        variant="icon"
        aria-label="Sair"
        title="Sair"
        onClick={onLogout}
        disabled={isLoggingOut}
      >
        <LogOut className="size-4" aria-hidden="true" />
      </Button>
    </div>
  )
}
