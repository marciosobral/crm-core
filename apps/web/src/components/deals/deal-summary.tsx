import { type Deal, isClosedStatus, type Lead } from "@crm/contract"
import { StatusBadge } from "#src/components/ui/status-badge.tsx"
import { formatDate, formatDealValue } from "#src/lib/format.ts"
import { lostReasonLabels } from "#src/lib/labels.ts"

type DealSummaryProps = {
  deal: Deal
  lead: Lead
  canClose: boolean
  variant: "panel" | "page"
  lastContact: string
  onClose: (mode: "WON" | "LOST") => void
}

export function DealSummary({
  deal,
  lead,
  canClose,
  variant,
  lastContact,
  onClose,
}: DealSummaryProps) {
  const isClosed = isClosedStatus(deal.status)

  return (
    <div className="space-y-5">
      {variant === "panel" ? (
        <h3 className="font-heading text-lg leading-tight font-bold text-white">{deal.title}</h3>
      ) : (
        <h2 className="font-heading text-lg leading-tight font-bold text-white">{deal.title}</h2>
      )}
      <div className="space-y-2 rounded-lg border border-line bg-canvas p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted">Valor do negócio</p>
          <StatusBadge status={deal.status} />
        </div>
        <p className="font-heading text-2xl font-extrabold break-words text-brand">
          {formatDealValue(deal.valueCents)}
        </p>
      </div>
      {variant === "panel" && (
        <dl className="space-y-3 text-sm">
          <SummaryRow label="Lead" value={`${lead.name} (${lead.company})`} />
          <SummaryRow label="Vendedor" value={deal.seller.name} />
          <SummaryRow label="Data de criação" value={formatDate(deal.createdAt)} />
          <SummaryRow label="Último contato" value={lastContact} />
        </dl>
      )}
      {!isClosed && canClose && (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            className="rounded-lg border border-status-won px-4 py-2.5 text-sm font-semibold text-status-won hover:bg-status-won/10"
            onClick={() => onClose("WON")}
          >
            Marcar Ganho
          </button>
          <button
            type="button"
            className="rounded-lg border border-status-lost px-4 py-2.5 text-sm font-semibold text-status-lost hover:bg-status-lost/10"
            onClick={() => onClose("LOST")}
          >
            Perdido
          </button>
        </div>
      )}
      {deal.closedAt && (
        <div className="space-y-1 text-sm">
          <p className="text-white">Fechado em {formatDate(deal.closedAt)}</p>
          {deal.lostReason && (
            <p className="text-muted">
              Motivo: {lostReasonLabels[deal.lostReason]}
              {deal.lostNote ? ` — ${deal.lostNote}` : ""}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-right font-semibold text-white">{value}</dd>
    </div>
  )
}
