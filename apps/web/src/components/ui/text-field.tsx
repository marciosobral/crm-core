import type { ComponentPropsWithoutRef } from "react"
import { cn } from "../../lib/cn.ts"

type TextFieldProps = ComponentPropsWithoutRef<"input"> & { label: string }

export function TextField({ label, required, className, ...inputProps }: TextFieldProps) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-zinc-400">
        {label} {required && <span className="text-brand">*</span>}
      </span>
      <input
        required={required}
        className={cn(
          "w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm outline-none focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/40",
          className,
        )}
        {...inputProps}
      />
    </label>
  )
}
