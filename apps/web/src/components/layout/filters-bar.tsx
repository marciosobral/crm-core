import type { ReactNode } from "react"

type FiltersBarProps = {
  summary: string
  search?: ReactNode
  chips?: ReactNode
  children?: ReactNode
}

// Below md the bar stacks as search, selects (two equal columns, or one full-width select), then
// the chips and the count on one wrapping line. From md the same pieces sit in a single row with
// the count pushed right: `md:contents` lets the chips and the count join that row.
export function FiltersBar({ summary, search, chips, children }: FiltersBarProps) {
  return (
    <div className="border-b border-line bg-surface px-4 py-[15px] md:px-8">
      <div className="flex flex-col gap-3 md:min-h-[34px] md:flex-row md:flex-wrap md:items-center md:gap-x-3 md:gap-y-2">
        {search && <div className="md:hidden">{search}</div>}
        <div className="grid grid-cols-2 gap-2 *:min-w-0 empty:hidden [&:has(>:only-child)]:grid-cols-1 md:flex md:items-center md:gap-4">
          {children}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 md:contents">
          {chips}
          <p
            aria-live="polite"
            className="text-[13px] leading-none text-muted md:ml-auto md:shrink-0"
          >
            {summary}
          </p>
        </div>
      </div>
    </div>
  )
}
