import { ChevronDown } from "lucide-react"
import { cn } from "#src/lib/cn.ts"
import { type SelectOption, useSelect } from "#src/lib/use-select.ts"
import { ChevronToggle, SelectList } from "./select-list.tsx"

type FilterSelectProps = {
  label: string
  value: string
  options: ReadonlyArray<SelectOption>
  onChange: (value: string) => void
  searchable?: boolean
}

export function FilterSelect({
  label,
  value,
  options,
  onChange,
  searchable = false,
}: FilterSelectProps) {
  const select = useSelect({
    value,
    options,
    onChange,
    isSearchable: searchable,
    onSearchChange: undefined,
    isLoading: false,
    emptyMessage: "Nenhuma opção encontrada",
    selectedLabel: undefined,
    matchAnchorWidth: false,
  })
  const triggerProps = { ...select.triggerProps, ref: select.triggerRef, id: select.id }

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: the click only widens the input's hit area; keyboard users use the input.
    <div
      ref={select.containerRef}
      onClick={searchable ? select.openFromBox : undefined}
      className={cn(
        "relative h-[33px] rounded-md border border-line bg-canvas text-[13px] leading-none whitespace-nowrap text-muted focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/40",
        searchable && "flex items-center gap-1 pr-8 pl-3.5",
      )}
    >
      {searchable ? (
        <>
          <span aria-hidden="true">{label}:</span>
          <input
            {...triggerProps}
            {...select.searchInputProps}
            aria-label={label}
            className="field-sizing-content max-w-44 min-w-12 bg-transparent text-muted text-ellipsis outline-none"
          />
          <ChevronToggle isOpen={select.isOpen} onToggle={select.toggle} className="right-3.5" />
        </>
      ) : (
        <>
          <button
            {...triggerProps}
            type="button"
            aria-label={label}
            className="flex size-full items-center gap-1 pr-8 pl-3.5 text-left outline-none"
          >
            <span className="truncate">
              {label}: {select.selectedText}
            </span>
          </button>
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-3.5 size-3 -translate-y-1/2 text-muted"
          />
        </>
      )}
      <SelectList
        list={select.list}
        label={label}
        className="w-max max-w-[calc(100vw-1rem)] min-w-44"
      />
    </div>
  )
}
