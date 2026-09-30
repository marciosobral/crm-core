import { type ComponentPropsWithoutRef, useId } from "react"
import { cn } from "../../lib/cn.ts"
import { controlClasses, Field } from "./field.tsx"

export type TextFieldProps = ComponentPropsWithoutRef<"input"> & {
  label: string
  error?: string | undefined
}

export function TextField({ label, required, error, className, ...inputProps }: TextFieldProps) {
  const id = useId()
  const errorId = `${id}-error`

  return (
    <Field label={label} required={required} error={error} controlId={id} errorId={errorId}>
      <input
        required={required}
        className={cn(controlClasses, className)}
        {...inputProps}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
    </Field>
  )
}
