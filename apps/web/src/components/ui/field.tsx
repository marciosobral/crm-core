import type { ReactNode } from "react"

export const controlClasses =
  "h-11 w-full rounded-md border border-line bg-canvas px-3 text-sm leading-none text-white placeholder:text-placeholder outline-none focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/40 aria-invalid:border-red-400"

type FieldProps = {
  label: string
  required?: boolean | undefined
  error?: string | undefined
  controlId: string
  errorId: string
  children: ReactNode
}

export function Field({ label, required, error, controlId, errorId, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={controlId}
        className="flex items-center gap-1 text-[13px] leading-4 font-semibold text-muted"
      >
        {label}
        {required && (
          <span aria-hidden="true" className="font-normal text-brand">
            *
          </span>
        )}
      </label>
      {children}
      {error && (
        <span id={errorId} className="block text-xs text-red-400">
          {error}
        </span>
      )}
    </div>
  )
}
