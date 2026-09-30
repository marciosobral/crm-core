import type { DealStatus, LeadSource, Role } from "@crm/contract"

export const roleLabels: Record<Role, string> = {
  SUPERVISOR: "Supervisor",
  SELLER: "Vendedor",
}

export const sourceLabels: Record<LeadSource, string> = {
  WEBSITE: "Site",
  REFERRAL: "Indicação",
  SOCIAL_MEDIA: "Redes sociais",
  EVENT: "Evento",
  OUTBOUND: "Prospecção ativa",
  STORE: "Loja física",
  OTHER: "Outro",
}

export const dealStatusLabels: Record<DealStatus, string> = {
  NEW: "Novo",
  CONTACTED: "Contato Feito",
  PROPOSAL_SENT: "Proposta Enviada",
  NEGOTIATION: "Negociação",
  WON: "Ganho",
  LOST: "Perdido",
}

export const dealStatusTextClasses: Record<DealStatus, string> = {
  NEW: "text-status-new",
  CONTACTED: "text-status-open",
  PROPOSAL_SENT: "text-status-open",
  NEGOTIATION: "text-status-open",
  WON: "text-status-won",
  LOST: "text-status-lost",
}

export const dealStatusDotClasses: Record<DealStatus, string> = {
  NEW: "bg-status-new",
  CONTACTED: "bg-status-open",
  PROPOSAL_SENT: "bg-status-open",
  NEGOTIATION: "bg-status-open",
  WON: "bg-status-won",
  LOST: "bg-status-lost",
}
