import type { ReactNode } from "react"

type FiltersBarProps = { summary: string; children?: ReactNode }

export function FiltersBar({ summary, children }: FiltersBarProps) {
  return (
    <div className="flex min-h-[65px] flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-8 py-[15px]">
      <div className="flex flex-wrap items-center gap-4">{children}</div>
      <p aria-live="polite" className="text-[13px] leading-none text-muted">
        {summary}
      </p>
    </div>
  )
}
