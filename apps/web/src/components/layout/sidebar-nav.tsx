import { Link } from "@tanstack/react-router"
import { Users } from "lucide-react"

export function SidebarNav({ onNavigate }: { onNavigate: () => void }) {
  return (
    <Link
      to="/leads"
      onClick={onNavigate}
      className="flex h-[42px] items-center gap-3 rounded-lg border px-4 text-sm leading-none"
      activeProps={{
        className: "border-brand/20 bg-brand/10 font-bold text-white [&>svg]:text-brand",
      }}
      inactiveProps={{
        className: "border-transparent font-medium text-muted hover:bg-line hover:text-zinc-100",
      }}
    >
      <Users className="size-[18px]" aria-hidden="true" />
      Leads
    </Link>
  )
}
