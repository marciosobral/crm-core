import { type ComponentPropsWithoutRef, useId } from "react"
import { cn } from "#src/lib/cn.ts"
import { controlClasses, Field } from "./field.tsx"

type TextAreaProps = ComponentPropsWithoutRef<"textarea"> & {
  label: string
  error?: string | undefined
}

export function TextArea({ label, required, error, className, ...textAreaProps }: TextAreaProps) {
  const id = useId()
  const errorId = `${id}-error`

  return (
    <Field label={label} required={required} error={error} controlId={id} errorId={errorId}>
      <textarea
        required={required}
        className={cn(controlClasses, "h-auto min-h-[100px] py-3 leading-normal", className)}
        {...textAreaProps}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
    </Field>
  )
}
