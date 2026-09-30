import { ChevronDown } from "lucide-react"
import { type KeyboardEvent, useEffect, useId, useState } from "react"
import { cn } from "../../lib/cn.ts"
import { controlClasses, Field } from "./field.tsx"

export type ComboboxOption = { value: string; label: string }

type ComboboxProps = {
  label: string
  name: string
  required?: boolean
  placeholder?: string
  error?: string | undefined
  inputValue: string
  onInputChange: (text: string) => void
  options: ReadonlyArray<ComboboxOption>
  isLoading: boolean
  emptyMessage: string
  onSelect: (option: ComboboxOption) => void
}

export function Combobox({
  label,
  name,
  required,
  placeholder,
  error,
  inputValue,
  onInputChange,
  options,
  isLoading,
  emptyMessage,
  onSelect,
}: ComboboxProps) {
  const id = useId()
  const listId = `${id}-list`
  const errorId = `${id}-error`
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const optionId = (index: number) => `${id}-option-${index}`
  const isListShown = isOpen && !isLoading && options.length > 0
  const statusMessage =
    isOpen && (isLoading || options.length === 0)
      ? isLoading
        ? "Carregando..."
        : emptyMessage
      : ""
  const popoverClasses =
    "absolute z-20 mt-1 w-full rounded-md border border-line bg-surface-raised py-1 shadow-lg"

  useEffect(() => {
    if (activeIndex >= 0)
      document.getElementById(`${id}-option-${activeIndex}`)?.scrollIntoView({ block: "nearest" })
  }, [id, activeIndex])

  const close = () => {
    setIsOpen(false)
    setActiveIndex(-1)
  }

  const select = (option: ComboboxOption) => {
    onSelect(option)
    close()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      setIsOpen(true)
      if (options.length === 0) return
      const step = event.key === "ArrowDown" ? 1 : -1
      setActiveIndex((index) => (index + step + options.length) % options.length)
    } else if (event.key === "Enter" && isOpen) {
      const option = options[activeIndex]
      if (option) {
        event.preventDefault()
        select(option)
      }
    } else if (event.key === "Escape" && isOpen) {
      event.preventDefault()
      close()
    }
  }

  return (
    <Field label={label} required={required} error={error} controlId={id} errorId={errorId}>
      <div className="relative">
        <input
          id={id}
          name={name}
          role="combobox"
          autoComplete="off"
          required={required}
          placeholder={placeholder}
          value={inputValue}
          aria-expanded={isOpen}
          aria-controls={isListShown ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={isOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={cn(controlClasses, "pr-9")}
          onChange={(event) => {
            onInputChange(event.target.value)
            setIsOpen(true)
            setActiveIndex(-1)
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={close}
          onKeyDown={onKeyDown}
        />
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-muted"
        />
        <div aria-live="polite">
          {statusMessage && (
            <div className={cn(popoverClasses, "px-3 py-2 text-sm text-muted")}>
              {statusMessage}
            </div>
          )}
        </div>
        {isListShown && (
          <div
            id={listId}
            role="listbox"
            aria-label={label}
            className={cn(popoverClasses, "max-h-64 overflow-y-auto")}
          >
            {options.map((option, index) => (
              <div
                key={option.value}
                id={optionId(index)}
                role="option"
                tabIndex={-1}
                aria-selected={index === activeIndex}
                // mousedown (not click) selects before the input's blur closes the list.
                onMouseDown={(event) => {
                  event.preventDefault()
                  select(option)
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  "cursor-pointer px-3 py-2 text-sm text-white",
                  index === activeIndex && "bg-line",
                )}
              >
                {option.label}
              </div>
            ))}
          </div>
        )}
      </div>
    </Field>
  )
}
