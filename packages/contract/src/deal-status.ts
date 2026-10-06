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

export const OpenDealStatus = Schema.Literals(["NEW", "CONTACTED", "PROPOSAL_SENT", "NEGOTIATION"])
export type OpenDealStatus = typeof OpenDealStatus.Type

export const isClosedStatus = (status: DealStatus) => status === "WON" || status === "LOST"
