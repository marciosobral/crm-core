import type { ComponentProps } from "react"
import { cn } from "#src/lib/cn.ts"

type ButtonVariant = "primary" | "secondary" | "icon"

export const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "rounded-md bg-brand px-6 py-3 text-sm leading-[18px] font-bold text-white hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60",
  secondary:
    "rounded-md border border-line bg-transparent px-6 py-[11px] text-sm leading-[18px] font-semibold text-muted hover:bg-line hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60",
  icon: "rounded-md p-1.5 text-muted hover:bg-line hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-brand disabled:cursor-not-allowed",
}

type ButtonProps = ComponentProps<"button"> & { variant?: ButtonVariant }

export function Button({ variant = "primary", type = "button", className, ...props }: ButtonProps) {
  return <button type={type} className={cn(variantClasses[variant], className)} {...props} />
}
