import type { ReactNode } from "react"
import { Logo } from "../ui/logo.tsx"

type AppShellProps = { footer: ReactNode; children: ReactNode }

export function AppShell({ footer, children }: AppShellProps) {
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-surface">
        <div className="px-6 py-6">
          <Logo />
        </div>
        <nav className="flex-1 px-3" aria-label="Navegação principal" />
        {footer}
      </aside>
      <main className="flex-1">{children}</main>
    </div>
  )
}
