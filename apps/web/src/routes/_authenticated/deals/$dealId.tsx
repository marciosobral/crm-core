import { hasPermission } from "@crm/contract"
import { useQuery, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Schema } from "effect"
import { ArrowLeft } from "lucide-react"
import { useState } from "react"
import { CloseDealDialog } from "../../../components/deals/close-deal-dialog.tsx"
import { DealSummary, SummaryRow } from "../../../components/deals/deal-summary.tsx"
import { TopBar } from "../../../components/layout/top-bar.tsx"
import { variantClasses } from "../../../components/ui/button.tsx"
import { meQueryOptions } from "../../../lib/auth.ts"
import { cn } from "../../../lib/cn.ts"
import { formatDate } from "../../../lib/dates.ts"
import { dealDetailsQueryOptions } from "../../../lib/deals.ts"
import { formatPhone } from "../../../lib/phone.ts"

const isUuid = Schema.is(Schema.String.check(Schema.isUUID()))

export const Route = createFileRoute("/_authenticated/deals/$dealId")({
  loader: ({ context }) => context.queryClient.ensureQueryData(meQueryOptions),
  component: DealPage,
})

function DealPage() {
  const { dealId } = Route.useParams()
  const isValidDealId = isUuid(dealId)
  const { data: user } = useSuspenseQuery(meQueryOptions)
  const detailsQuery = useQuery({ ...dealDetailsQueryOptions(dealId), enabled: isValidDealId })
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
      <div className="min-h-0 flex-1 overflow-y-auto">
        {details ? (
          <div className="grid gap-6 p-4 md:p-8 lg:grid-cols-[minmax(0,420px)_1fr]">
            <div className="space-y-6">
              <section className="rounded-xl border border-line bg-surface p-5">
                <DealSummary
                  deal={details.deal}
                  lead={details.lead}
                  variant="page"
                  canClose={hasPermission(user, "deal.close")}
                  onClose={setCloseMode}
                />
              </section>
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
