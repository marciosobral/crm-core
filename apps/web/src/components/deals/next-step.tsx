import { AssistantRateLimited, AssistantUnavailable, DealClosed } from "@crm/contract"
import { useMutation } from "@tanstack/react-query"
import { Sparkles } from "lucide-react"
import { Button } from "#src/components/ui/button.tsx"
import { runApi } from "#src/lib/api-client.ts"
import { cn } from "#src/lib/cn.ts"

type NextStepProps = {
  dealId: string
  variant: "panel" | "page"
}

const errorMessage = (error: Error) => {
  if (error instanceof AssistantRateLimited)
    return `Muitas sugestões em pouco tempo. Tente novamente em ${error.retryAfterSeconds} s.`
  if (error instanceof AssistantUnavailable)
    return "Assistente indisponível no momento. Tente novamente mais tarde."
  if (error instanceof DealClosed) return "Este negócio já foi fechado."
  return "Não foi possível gerar a sugestão. Tente novamente."
}

export function NextStep({ dealId, variant }: NextStepProps) {
  const suggestionMutation = useMutation({
    mutationFn: () => runApi((client) => client.deals.suggestNextStep({ params: { id: dealId } })),
  })
  const Heading = variant === "panel" ? "h3" : "h2"
  const suggestion = suggestionMutation.data

  return (
    <section
      aria-labelledby="next-step-title"
      className={cn(
        "space-y-3",
        variant === "panel"
          ? "border-t border-line pt-6"
          : "rounded-xl border border-line bg-surface p-5",
      )}
    >
      <Heading
        id="next-step-title"
        className={cn(
          "flex items-center gap-2 font-heading font-bold text-white",
          variant === "panel" ? "text-sm" : "text-base",
        )}
      >
        <Sparkles className="size-3.5 text-brand" aria-hidden="true" />
        Próximo passo
      </Heading>
      <div aria-live="polite">
        {suggestion && (
          <div className="space-y-1.5 rounded-md border border-line bg-canvas p-3">
            <p className="text-sm font-semibold break-words text-white">{suggestion.action}</p>
            <p className="text-xs leading-[17px] break-words text-muted">{suggestion.reason}</p>
          </div>
        )}
      </div>
      {suggestionMutation.isError && (
        <p role="alert" className="text-xs text-red-400">
          {errorMessage(suggestionMutation.error)}
        </p>
      )}
      <Button
        variant="secondary"
        className="flex w-full items-center justify-center gap-2"
        disabled={suggestionMutation.isPending}
        onClick={() => suggestionMutation.mutate()}
      >
        {suggestionMutation.isPending
          ? "Gerando sugestão..."
          : suggestion
            ? "Gerar outra"
            : "Sugerir próximo passo"}
      </Button>
    </section>
  )
}
