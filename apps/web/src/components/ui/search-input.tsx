import { Search } from "lucide-react"
import { cn } from "#src/lib/cn.ts"

type SearchInputProps = {
  className: string
  label: string
  value: string
  onChange: (value: string) => void
}

export function SearchInput({ className, label, value, onChange }: SearchInputProps) {
  return (
    <div className={cn("relative", className)}>
      <Search
        className="pointer-events-none absolute top-1/2 left-4 size-3.5 -translate-y-1/2 text-muted"
        aria-hidden="true"
      />
      <input
        type="search"
        aria-label={label}
        placeholder="Buscar..."
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-[34px] w-full rounded-md border border-line bg-canvas pr-4 pl-[38px] text-sm leading-none outline-none placeholder:text-placeholder focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/40"
      />
    </div>
  )
}
