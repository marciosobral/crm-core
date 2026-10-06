import { Schema } from "effect"

export const DealStatus = Schema.Literals([
  "NEW",
  "CONTACTED",
  "PROPOSAL_SENT",
  "NEGOTIATION",
  "WON",
  "LOST",
])
export type DealStatus = typeof DealStatus.Type

export const dealStatusLabels: Record<DealStatus, string> = {
  NEW: "Novo",
  CONTACTED: "Contato Feito",
  PROPOSAL_SENT: "Proposta Enviada",
  NEGOTIATION: "Negociação",
  WON: "Ganho",
  LOST: "Perdido",
}

export const OpenDealStatus = Schema.Literals(["NEW", "CONTACTED", "PROPOSAL_SENT", "NEGOTIATION"])
export type OpenDealStatus = typeof OpenDealStatus.Type

export const isClosedStatus = (status: DealStatus) => status === "WON" || status === "LOST"
