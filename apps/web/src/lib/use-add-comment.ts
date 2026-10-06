import { useMutation, useQueryClient } from "@tanstack/react-query"
import { runApi } from "./api-client.ts"
import { dealActivitiesQueryOptions } from "./deals.ts"
import { leadsQueryKey } from "./leads.ts"

export function useAddComment(dealId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: string) =>
      runApi((client) => client.deals.comment({ params: { id: dealId }, payload: { body } })),
    onSuccess: (comment) =>
      queryClient.setQueryData(dealActivitiesQueryOptions(dealId).queryKey, (current) =>
        current ? [comment, ...current] : current,
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: [leadsQueryKey] }),
  })
}
