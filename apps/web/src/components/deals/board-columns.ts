import type { DealStatus, OpenDealStatus } from "@crm/contract"

export type BoardColumn = {
  status: DealStatus
  statuses: ReadonlyArray<DealStatus>
  dropStatus: OpenDealStatus | undefined
}

export const boardColumns: ReadonlyArray<BoardColumn> = [
  { status: "NEW", statuses: ["NEW"], dropStatus: "NEW" },
  { status: "CONTACTED", statuses: ["CONTACTED"], dropStatus: "CONTACTED" },
  { status: "PROPOSAL_SENT", statuses: ["PROPOSAL_SENT"], dropStatus: "PROPOSAL_SENT" },
  { status: "NEGOTIATION", statuses: ["NEGOTIATION"], dropStatus: "NEGOTIATION" },
  { status: "WON", statuses: ["WON", "LOST"], dropStatus: undefined },
]
