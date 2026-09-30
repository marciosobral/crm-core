import { ChevronDown } from "lucide-react"
import { type ComponentPropsWithoutRef, useId } from "react"
import { cn } from "../../lib/cn.ts"
import { controlClasses, Field } from "./field.tsx"

type SelectProps = ComponentPropsWithoutRef<"select"> & {
  label: string
  error?: string | undefined
}

export function Select({
  label,
  required,
  error,
  className,
  children,
  ...selectProps
}: SelectProps) {
  const id = useId()
  const errorId = `${id}-error`

  return (
    <Field label={label} required={required} error={error} controlId={id} errorId={errorId}>
      <span className="relative block">
        <select
          required={required}
          className={cn(
            controlClasses,
            "appearance-none pr-9 [&>option]:text-white",
            selectProps.value === "" && "text-placeholder",
            className,
          )}
          {...selectProps}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        >
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
      </span>
    </Field>
  )
}
