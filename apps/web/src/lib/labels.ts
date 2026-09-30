import type { LeadSource, Role } from "@crm/contract"

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
