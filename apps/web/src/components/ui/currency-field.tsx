import { centsFromInput, formatCents } from "#src/lib/format.ts"
import { TextField, type TextFieldProps } from "./text-field.tsx"

type CurrencyFieldProps = Omit<TextFieldProps, "value" | "onChange" | "type" | "inputMode"> & {
  cents: number
  onCentsChange: (cents: number) => void
}

export function CurrencyField({ cents, onCentsChange, ...fieldProps }: CurrencyFieldProps) {
  return (
    <TextField
      {...fieldProps}
      inputMode="numeric"
      value={cents === 0 ? "" : formatCents(cents)}
      onChange={(event) => onCentsChange(centsFromInput(event.target.value))}
    />
  )
}
