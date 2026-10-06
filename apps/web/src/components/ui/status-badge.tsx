import { type DealStatus, dealStatusLabels } from "@crm/contract"
import { cn } from "#src/lib/cn.ts"
import { dealStatusDotClasses, dealStatusTextClasses } from "#src/lib/labels.ts"

export function StatusBadge({ status }: { status: DealStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas px-2.5 py-1 text-xs leading-none font-semibold whitespace-nowrap",
        dealStatusTextClasses[status],
      )}
    >
      <span
        aria-hidden="true"
        className={cn("size-1.5 rounded-full", dealStatusDotClasses[status])}
      />
      {dealStatusLabels[status]}
    </span>
  )
}
