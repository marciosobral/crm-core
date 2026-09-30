import type { ReactNode } from "react"

type FiltersBarProps = { summary: string; search?: ReactNode; children?: ReactNode }

export function FiltersBar({ summary, search, children }: FiltersBarProps) {
  return (
    <div className="border-b border-line bg-surface px-4 py-[15px] md:px-8">
      <div className="flex min-h-[34px] flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-3 md:gap-4">{children}</div>
        <p aria-live="polite" className="ml-auto shrink-0 text-[13px] leading-none text-muted">
          {summary}
        </p>
      </div>
      {search && <div className="mt-3 md:hidden">{search}</div>}
    </div>
  )
}
