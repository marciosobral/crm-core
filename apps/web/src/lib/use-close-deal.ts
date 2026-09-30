import type { CloseDealPayload, Deal } from "@crm/contract"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { runApi } from "./api-client.ts"
import { dealDetailsQueryKey, dealsQueryKey } from "./deals.ts"
import { leadsQueryKey } from "./leads.ts"

export function useCloseDeal({ onClosed }: { onClosed?: (deal: Deal) => void } = {}) {
  const queryClient = useQueryClient()
  return useMutation({
    // The client types each union member as its own overload, so the payload is narrowed before each call.
    mutationFn: ({ deal, payload }: { deal: Deal; payload: CloseDealPayload }) =>
      runApi((client) =>
        payload.result === "WON"
          ? client.deals.close({ params: { id: deal.id }, payload })
          : client.deals.close({ params: { id: deal.id }, payload }),
      ),
    onSuccess: (closed) => onClosed?.(closed),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: [dealsQueryKey] }),
        queryClient.invalidateQueries({ queryKey: [dealDetailsQueryKey] }),
        queryClient.invalidateQueries({ queryKey: [leadsQueryKey] }),
      ]),
  })
}
