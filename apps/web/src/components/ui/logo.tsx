import { cn } from "../../lib/cn.ts"

type LogoSize = "md" | "lg"

const wordSizeClasses: Record<LogoSize, string> = {
  md: "text-[28px]",
  lg: "text-[48px]",
}

const suffixSizeClasses: Record<LogoSize, string> = {
  md: "text-[10px]",
  lg: "text-[14px]",
}

export function Logo({ size = "md" }: { size?: LogoSize }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("font-display font-black uppercase leading-none", wordSizeClasses[size])}>
        K<span className="text-brand">I</span>KOS
      </span>
      <span
        className={cn(
          "font-mono-brand font-normal uppercase leading-none text-brand",
          suffixSizeClasses[size],
        )}
      >
        CRM
      </span>
    </span>
  )
}
