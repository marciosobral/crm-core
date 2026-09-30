import { Link } from "@tanstack/react-router"
import { Briefcase, Users } from "lucide-react"

const navItems = [
  { to: "/leads", label: "Leads", Icon: Users },
  { to: "/deals", label: "Negócios", Icon: Briefcase },
] as const

export function SidebarNav({ onNavigate }: { onNavigate: () => void }) {
  return navItems.map(({ to, label, Icon }) => (
    <Link
      key={to}
      to={to}
      onClick={onNavigate}
      className="flex h-[42px] items-center gap-3 rounded-lg border px-4 text-sm leading-none"
      activeProps={{
        className: "border-brand/20 bg-brand/10 font-bold text-white [&>svg]:text-brand",
      }}
      inactiveProps={{
        className: "border-transparent font-medium text-muted hover:bg-line hover:text-zinc-100",
      }}
    >
      <Icon className="size-[18px]" aria-hidden="true" />
      {label}
    </Link>
  ))
}
