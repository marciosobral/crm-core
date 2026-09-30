import { Menu } from "lucide-react"
import { type ReactNode, useContext } from "react"
import { Button } from "../ui/button.tsx"
import { NavDrawerContext } from "./nav-drawer-context.ts"

type TopBarProps = { title: string; children?: ReactNode }

export function TopBar({ title, children }: TopBarProps) {
  const { isNavOpen, openNav, menuButtonRef } = useContext(NavDrawerContext)

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface px-4 md:h-[78px] md:gap-6 md:px-8">
      <Button
        ref={menuButtonRef}
        variant="icon"
        className="flex size-10 items-center justify-center lg:hidden"
        aria-label="Abrir menu"
        aria-controls="app-sidebar"
        aria-expanded={isNavOpen}
        onClick={openNav}
      >
        <Menu className="size-5" aria-hidden="true" />
      </Button>
      <h1 className="min-w-0 flex-1 truncate font-heading text-xl leading-none font-extrabold text-white md:text-2xl">
        {title}
      </h1>
      {children && <div className="flex shrink-0 items-center gap-3 md:gap-6">{children}</div>}
    </header>
  )
}
