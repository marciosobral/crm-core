import type { ComponentPropsWithoutRef } from "react"
import { cn } from "../../lib/cn.ts"

type ButtonVariant = "primary" | "icon"

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "cursor-pointer rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60",
  icon: "cursor-pointer rounded-md p-1.5 text-zinc-400 hover:bg-line hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-brand disabled:cursor-not-allowed",
}

type ButtonProps = ComponentPropsWithoutRef<"button"> & { variant?: ButtonVariant }

export function Button({ variant = "primary", type = "button", className, ...props }: ButtonProps) {
  return <button type={type} className={cn(variantClasses[variant], className)} {...props} />
}
