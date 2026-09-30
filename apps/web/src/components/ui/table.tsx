import type { ComponentPropsWithoutRef } from "react"
import { cn } from "../../lib/cn.ts"

export function Table({ className, ...props }: ComponentPropsWithoutRef<"table">) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className={cn("w-full text-left", className)} {...props} />
    </div>
  )
}

export function TableHead({ children }: { children: string }) {
  return (
    <th
      scope="col"
      className="px-6 py-3.5 text-[13px] leading-4 font-bold whitespace-nowrap text-white"
    >
      {children}
    </th>
  )
}

export function TableRow({ className, ...props }: ComponentPropsWithoutRef<"tr">) {
  return (
    <tr className={cn("border-b border-line text-[13px] leading-none", className)} {...props} />
  )
}

type TableCellProps = ComponentPropsWithoutRef<"td"> & { isSecondary?: boolean }

export function TableCell({ isSecondary = false, className, ...props }: TableCellProps) {
  return (
    <td
      className={cn("px-6 py-3 whitespace-nowrap", isSecondary && "text-muted", className)}
      {...props}
    />
  )
}
