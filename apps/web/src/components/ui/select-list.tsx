import { Check, ChevronDown } from "lucide-react"
import { cn } from "../../lib/cn.ts"
import type { SelectListState } from "../../lib/use-select.ts"

type SelectListProps = {
  list: SelectListState
  label: string
  className?: string
}

export function SelectList({ list, label, className }: SelectListProps) {
  return (
    <div
      ref={list.popoverRef}
      popover="manual"
      className={cn(
        "fixed inset-auto m-0 overflow-hidden rounded-md border border-line bg-surface-raised p-0 text-white shadow-lg",
        className,
      )}
    >
      <div aria-live="polite">
        {list.statusMessage && (
          <div className="px-3 py-2 text-sm text-muted">{list.statusMessage}</div>
        )}
      </div>
      {list.isListShown && (
        <div
          id={list.listId}
          role="listbox"
          aria-label={label}
          className="max-h-64 overflow-y-auto"
        >
          {list.options.map((option, index) => (
            // biome-ignore lint/a11y/useKeyWithClickEvents: the keyboard drives options from the trigger through aria-activedescendant.
            <div
              key={option.value}
              id={list.optionId(index)}
              role="option"
              tabIndex={-1}
              aria-selected={option.value === list.value}
              // Keeping focus on the trigger: mousedown would otherwise move it to the option.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => list.onPick(option)}
              onPointerMove={() => list.onHover(index)}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm text-white",
                index === list.activeIndex && "bg-line",
              )}
            >
              {option.label}
              {option.value === list.value && (
                <Check aria-hidden="true" className="size-3.5 shrink-0 text-brand" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

type ChevronToggleProps = {
  isOpen: boolean
  onToggle: () => void
  className?: string
}

// Used next to a search input, which a click would only open; the chevron also closes the list.
export function ChevronToggle({ isOpen, onToggle, className }: ChevronToggleProps) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={isOpen ? "Fechar lista" : "Abrir lista"}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onToggle}
      className={cn("absolute top-1/2 flex -translate-y-1/2 cursor-pointer text-muted", className)}
    >
      <ChevronDown aria-hidden="true" className="size-3.5" />
    </button>
  )
}
