import { X } from "lucide-react"
import { type ReactNode, useEffect, useRef, useState } from "react"
import { Logo } from "#src/components/ui/logo.tsx"
import { cn } from "#src/lib/cn.ts"
import { desktopMediaQuery } from "#src/lib/media.ts"
import { NavDrawerContext } from "./nav-drawer-context.ts"
import { SidebarNav } from "./sidebar-nav.tsx"

type AppShellProps = { footer: ReactNode; children: ReactNode }

export function AppShell({ footer, children }: AppShellProps) {
  const [isNavOpen, setIsNavOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const sidebarRef = useRef<HTMLElement>(null)
  const wasNavOpenRef = useRef(false)
  const closeNav = () => setIsNavOpen(false)

  useEffect(() => {
    if (!isNavOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsNavOpen(false)
    }
    // The drawer stops existing at lg, so an open one must not leave the page behind it inert.
    const desktopQuery = window.matchMedia(desktopMediaQuery)
    const closeOnDesktop = () => setIsNavOpen(false)
    document.addEventListener("keydown", closeOnEscape)
    desktopQuery.addEventListener("change", closeOnDesktop)
    return () => {
      document.removeEventListener("keydown", closeOnEscape)
      desktopQuery.removeEventListener("change", closeOnDesktop)
    }
  }, [isNavOpen])

  // Runs after the commit that toggles `inert`, so the menu button is focusable again when focus returns to it.
  useEffect(() => {
    if (isNavOpen) sidebarRef.current?.querySelector("a")?.focus()
    else if (wasNavOpenRef.current) menuButtonRef.current?.focus()
    wasNavOpenRef.current = isNavOpen
  }, [isNavOpen])

  return (
    <NavDrawerContext value={{ isNavOpen, openNav: () => setIsNavOpen(true), menuButtonRef }}>
      <div className="flex min-h-dvh">
        {isNavOpen && (
          <div
            aria-hidden="true"
            className="fixed inset-0 z-30 bg-black/60 lg:hidden"
            onClick={closeNav}
          />
        )}
        <aside
          ref={sidebarRef}
          id="app-sidebar"
          {...(isNavOpen ? { role: "dialog", "aria-modal": true, "aria-label": "Menu" } : {})}
          className={cn(
            "fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col justify-between border-r border-line bg-surface px-6 pb-6 duration-200 lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0",
            // Visibility only transitions on close, so the drawer is focusable the moment it opens and stays visible while it slides out.
            isNavOpen
              ? "translate-x-0 transition-[translate]"
              : "-translate-x-full transition-[translate,visibility] max-lg:invisible",
          )}
        >
          <div className="flex flex-col">
            {/* Same height as the top bar, so the first nav item lines up with the filters bar. */}
            <div className="flex h-16 items-center justify-between md:h-[78px]">
              <Logo />
              <button
                type="button"
                aria-label="Fechar menu"
                className="text-muted hover:text-white lg:hidden"
                onClick={closeNav}
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <nav className="flex flex-col gap-2 pt-2.5 md:pt-3" aria-label="Navegação principal">
              <SidebarNav onNavigate={closeNav} />
            </nav>
          </div>
          {footer}
        </aside>
        <main inert={isNavOpen} className="flex min-w-0 flex-1 flex-col">
          {children}
        </main>
      </div>
    </NavDrawerContext>
  )
}
