import { hasPermission } from "@crm/contract"
import { useQuery, useSuspenseQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ArrowRight, CircleX } from "lucide-react"
import { type KeyboardEvent, useState } from "react"
import { variantClasses } from "#src/components/ui/button.tsx"
import { meQueryOptions } from "#src/lib/auth.ts"
import { cn } from "#src/lib/cn.ts"
import {
  dealActivitiesQueryOptions,
  dealDetailsQueryOptions,
  lastContactLabel,
} from "#src/lib/deals.ts"
import { CloseDealDialog } from "./close-deal-dialog.tsx"
import { DealSummary } from "./deal-summary.tsx"
import { PanelComments } from "./panel-comments.tsx"

type DealPanelProps = { dealId: string; onDismiss: () => void }

export function DealPanel({ dealId, onDismiss }: DealPanelProps) {
  const { data: user } = useSuspenseQuery(meQueryOptions)
  const detailsQuery = useQuery(dealDetailsQueryOptions(dealId))
  const activitiesQuery = useQuery(dealActivitiesQueryOptions(dealId))
  const [closeMode, setCloseMode] = useState<"WON" | "LOST" | undefined>(undefined)
  const details = detailsQuery.data

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") onDismiss()
  }

  return (
    <>
      <aside
        aria-labelledby="deal-panel-title"
        className="absolute inset-y-0 right-0 z-20 hidden w-[360px] flex-col border-l border-line bg-surface shadow-2xl lg:flex"
        onKeyDown={onKeyDown}
      >
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-5 py-4">
          <h2 id="deal-panel-title" className="font-heading text-base font-bold text-white">
            Detalhes do Negócio
          </h2>
          <button
            type="button"
            className="text-muted hover:text-white"
            aria-label="Fechar detalhes"
            onClick={onDismiss}
          >
            <CircleX className="size-5" aria-hidden="true" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {details ? (
            <div className="space-y-6">
              <DealSummary
                deal={details.deal}
                lead={details.lead}
                variant="panel"
                canClose={hasPermission(user, "deal.close")}
                lastContact={lastContactLabel(activitiesQuery.data, activitiesQuery.isError)}
                onClose={setCloseMode}
              />
              <PanelComments
                dealId={dealId}
                activities={activitiesQuery.data}
                isError={activitiesQuery.isError}
              />
            </div>
          ) : (
            <p className="text-sm text-muted">
              {detailsQuery.isError ? "Negócio não encontrado." : "Carregando..."}
            </p>
          )}
        </div>
        {details && (
          <footer className="shrink-0 border-t border-line p-5">
            <Link
              to="/deals/$dealId"
              params={{ dealId }}
              className={cn(
                variantClasses.secondary,
                "flex w-full items-center justify-center gap-2 border-brand/50 font-bold text-white hover:border-brand hover:bg-brand/10 hover:text-white",
              )}
            >
              Ver detalhes e histórico
              <ArrowRight className="size-3.5 text-brand" aria-hidden="true" />
            </Link>
          </footer>
        )}
      </aside>
      {details && closeMode && (
        <CloseDealDialog
          key={details.deal.id}
          deal={details.deal}
          initialMode={closeMode}
          onDismiss={() => setCloseMode(undefined)}
          onClosed={() => setCloseMode(undefined)}
        />
      )}
    </>
  )
}
