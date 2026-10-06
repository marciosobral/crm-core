import { hasPermission, isClosedStatus } from "@crm/contract"
import { useQuery, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Schema } from "effect"
import { ArrowLeft } from "lucide-react"
import { useState } from "react"
import { ActivityTimeline } from "#src/components/deals/activity-timeline.tsx"
import { CloseDealDialog } from "#src/components/deals/close-deal-dialog.tsx"
import { DealSummary, SummaryRow } from "#src/components/deals/deal-summary.tsx"
import { NextStep } from "#src/components/deals/next-step.tsx"
import { TopBar } from "#src/components/layout/top-bar.tsx"
import { variantClasses } from "#src/components/ui/button.tsx"
import { meQueryOptions } from "#src/lib/auth.ts"
import { cn } from "#src/lib/cn.ts"
import {
  dealActivitiesQueryOptions,
  dealDetailsQueryOptions,
  lastContactLabel,
} from "#src/lib/deals.ts"
import { formatDate, formatPhone } from "#src/lib/format.ts"

const isUuid = Schema.is(Schema.String.check(Schema.isUUID()))

export const Route = createFileRoute("/_authenticated/deals/$dealId")({
  validateSearch: (search: Record<string, unknown>): { focus?: "comment" } =>
    search.focus === "comment" ? { focus: "comment" } : {},
  loader: ({ context }) => context.queryClient.ensureQueryData(meQueryOptions),
  component: DealPage,
})

function DealPage() {
  const { dealId } = Route.useParams()
  const { focus } = Route.useSearch()
  const navigate = Route.useNavigate()
  const isValidDealId = isUuid(dealId)
  const { data: user } = useSuspenseQuery(meQueryOptions)
  const detailsQuery = useQuery({ ...dealDetailsQueryOptions(dealId), enabled: isValidDealId })
  const activitiesQuery = useQuery({
    ...dealActivitiesQueryOptions(dealId),
    enabled: isValidDealId,
  })
  const [closeMode, setCloseMode] = useState<"WON" | "LOST" | undefined>(undefined)
  const details = detailsQuery.data

  return (
    <div className="flex h-dvh min-w-0 flex-col">
      <TopBar title={details?.deal.title ?? "Negócio"}>
        <Link
          to="/deals"
          className={cn(
            variantClasses.secondary,
            "flex size-[38px] items-center justify-center gap-2 p-0 sm:size-auto sm:px-[18px] sm:py-[9px]",
          )}
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">Voltar para negócios</span>
        </Link>
      </TopBar>
      <div className="min-h-0 flex-1 overflow-y-auto lg:overflow-hidden">
        {details ? (
          <div className="grid grid-cols-1 gap-6 p-4 md:p-8 lg:h-full lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
            <div className="space-y-6 lg:min-h-0 lg:overflow-y-auto">
              <section className="rounded-xl border border-line bg-surface p-5">
                <DealSummary
                  deal={details.deal}
                  lead={details.lead}
                  variant="page"
                  canClose={hasPermission(user, "deal.close")}
                  lastContact={lastContactLabel(activitiesQuery.data, activitiesQuery.isError)}
                  onClose={setCloseMode}
                />
              </section>
              {hasPermission(user, "deal.suggest") && !isClosedStatus(details.deal.status) && (
                <NextStep key={dealId} dealId={dealId} variant="page" />
              )}
              <section className="space-y-4 rounded-xl border border-line bg-surface p-5">
                <h2 className="font-heading text-base font-bold text-white">
                  Dossiê do Cliente & Contatos
                </h2>
                <dl className="space-y-3 text-sm">
                  <SummaryRow label="Lead responsável" value={details.lead.name} />
                  <SummaryRow label="Empresa" value={details.lead.company} />
                  <SummaryRow label="Telefone" value={formatPhone(details.lead.phone)} />
                  <SummaryRow label="E-mail corporativo" value={details.lead.email} />
                  <SummaryRow label="Vendedor proprietário" value={details.deal.seller.name} />
                  <SummaryRow label="Data de criação" value={formatDate(details.deal.createdAt)} />
                  <SummaryRow
                    label="Último contato"
                    value={lastContactLabel(activitiesQuery.data, activitiesQuery.isError)}
                  />
                  <SummaryRow
                    label="Data prevista de fechamento"
                    value={
                      details.deal.expectedCloseDate
                        ? formatDate(details.deal.expectedCloseDate)
                        : "Não informada"
                    }
                  />
                </dl>
              </section>
            </div>
            <ActivityTimeline
              dealId={dealId}
              activities={activitiesQuery.data}
              isError={activitiesQuery.isError}
              shouldFocusComposer={focus === "comment"}
              onComposerFocused={() => void navigate({ search: {}, replace: true })}
            />
          </div>
        ) : (
          <div className="p-4 md:p-8">
            <div className="space-y-3 rounded-xl border border-line bg-surface px-4 py-10 text-center">
              <p className="text-sm text-muted">
                {detailsQuery.isError || !isValidDealId
                  ? "Negócio não encontrado."
                  : "Carregando..."}
              </p>
              {(detailsQuery.isError || !isValidDealId) && (
                <Link to="/deals" className="text-sm font-semibold text-brand hover:underline">
                  Voltar para negócios
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
      {details && closeMode && (
        <CloseDealDialog
          key={details.deal.id}
          deal={details.deal}
          initialMode={closeMode}
          onDismiss={() => setCloseMode(undefined)}
          onClosed={() => setCloseMode(undefined)}
        />
      )}
    </div>
  )
}
