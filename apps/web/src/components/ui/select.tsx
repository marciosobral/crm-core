import { ChevronDown } from "lucide-react"
import { cn } from "#src/lib/cn.ts"
import { type SelectOption, useSelect } from "#src/lib/use-select.ts"
import { controlClasses, Field } from "./field.tsx"
import { ChevronToggle, SelectList } from "./select-list.tsx"

type SelectProps = {
  label: string
  name: string
  required?: boolean
  error?: string | undefined
  placeholder: string
  value: string
  options: ReadonlyArray<SelectOption>
  onChange: (value: string) => void
  searchable?: boolean
  onSearchChange?: (text: string) => void
  isLoading?: boolean
  emptyMessage?: string
  selectedLabel?: string
}

export function Select({
  label,
  name,
  required,
  error,
  placeholder,
  value,
  options,
  onChange,
  searchable = false,
  onSearchChange,
  isLoading = false,
  emptyMessage = "Nenhuma opção encontrada",
  selectedLabel,
}: SelectProps) {
  const select = useSelect({
    value,
    options,
    onChange,
    isSearchable: searchable,
    onSearchChange,
    isLoading,
    emptyMessage,
    selectedLabel,
    matchAnchorWidth: true,
  })
  const errorId = `${select.id}-error`
  const triggerProps = {
    ...select.triggerProps,
    ref: select.triggerRef,
    id: select.id,
    name,
    "aria-required": required,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? errorId : undefined,
  }

  return (
    <Field label={label} required={required} error={error} controlId={select.id} errorId={errorId}>
      <div ref={select.containerRef} className="relative">
        {searchable ? (
          <>
            <input
              {...triggerProps}
              {...select.searchInputProps}
              placeholder={placeholder}
              className={cn(controlClasses, "pr-9")}
            />
            <ChevronToggle isOpen={select.isOpen} onToggle={select.toggle} className="right-3" />
          </>
        ) : (
          <>
            <button
              {...triggerProps}
              type="button"
              className={cn(controlClasses, "truncate pr-9 text-left")}
            >
              {select.selectedText || <span className="text-placeholder">{placeholder}</span>}
            </button>
            <ChevronDown
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-muted"
            />
          </>
        )}
        <SelectList list={select.list} label={label} />
      </div>
    </Field>
  )
}
