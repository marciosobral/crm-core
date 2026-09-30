import { ChevronDown } from "lucide-react"
import type { ComponentPropsWithoutRef } from "react"

type FilterSelectProps = Omit<ComponentPropsWithoutRef<"select">, "className"> & { label: string }

export function FilterSelect({ label, children, ...selectProps }: FilterSelectProps) {
  return (
    <label className="relative flex h-[33px] items-center gap-1 rounded-md border border-line bg-canvas px-3.5 text-[13px] leading-none text-muted focus-within:border-brand">
      <span>{label}:</span>
      <select
        className="field-sizing-content min-w-0 cursor-pointer appearance-none bg-transparent pr-5 text-[13px] text-muted outline-none [&>option]:text-white"
        {...selectProps}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3.5 size-3 text-muted"
      />
    </label>
  )
}
