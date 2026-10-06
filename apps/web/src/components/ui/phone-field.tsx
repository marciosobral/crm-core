import { formatPhone, phoneDigits } from "#src/lib/format.ts"
import { TextField, type TextFieldProps } from "./text-field.tsx"

type PhoneFieldProps = Omit<TextFieldProps, "value" | "onChange" | "type" | "inputMode"> & {
  value: string
  onValueChange: (digits: string) => void
}

export function PhoneField({ value, onValueChange, ...fieldProps }: PhoneFieldProps) {
  const formattedValue = formatPhone(value)

  return (
    <TextField
      {...fieldProps}
      type="tel"
      inputMode="tel"
      value={formattedValue}
      onChange={(event) => {
        const nextDigits = phoneDigits(event.target.value)
        // Deleting only a separator keeps the digits unchanged and the formatter would restore it, so drop the last digit instead.
        const isSeparatorDeleted =
          nextDigits === value && event.target.value.length < formattedValue.length
        onValueChange(isSeparatorDeleted ? value.slice(0, -1) : nextDigits)
      }}
    />
  )
}
