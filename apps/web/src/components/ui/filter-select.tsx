import { ChevronDown } from "lucide-react"

type FilterSelectProps = {
  label: string
  value: string
  options: ReadonlyArray<{ value: string; label: string }>
  onChange: (value: string) => void
}

// The native select is invisible and stretched over the whole control so a click anywhere
// (padding, chevron) opens it; the visible text is rendered separately.
export function FilterSelect({ label, value, options, onChange }: FilterSelectProps) {
  const selectedLabel = options.find((option) => option.value === value)?.label ?? ""

  return (
    <div className="relative flex h-[33px] items-center gap-1 rounded-md border border-line bg-canvas pr-8 pl-3.5 text-[13px] leading-none whitespace-nowrap text-muted focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/40">
      <span aria-hidden="true">
        {label}: {selectedLabel}
      </span>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3.5 size-3 text-muted"
      />
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 size-full cursor-pointer appearance-none opacity-0 [&>option]:bg-surface [&>option]:text-white"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}
