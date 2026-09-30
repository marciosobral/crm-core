import { type DealStatus, hasPermission, type Permission } from "@crm/contract"
import { type QueryClient, queryOptions } from "@tanstack/react-query"
import { runApi } from "./api-client.ts"
import { meQueryOptions } from "./auth.ts"

export const leadsQueryKey = "leads"

export const leadsQueryOptions = (query: {
  search?: string
  sellerId?: string
  status?: DealStatus
}) =>
  queryOptions({
    queryKey: [leadsQueryKey, query],
    queryFn: () => runApi((client) => client.leads.list({ query })),
  })

export const sellersQueryOptions = queryOptions({
  queryKey: ["sellers"],
  queryFn: () => runApi((client) => client.sellers.list()),
  staleTime: 5 * 60_000,
})

export const isVisibleSellerId = async (
  queryClient: QueryClient,
  sellerId: string,
  permission: Permission,
) => {
  const user = await queryClient.ensureQueryData(meQueryOptions)
  const sellers = hasPermission(user, permission)
    ? await queryClient.ensureQueryData(sellersQueryOptions)
    : []
  return sellers.some((seller) => seller.id === sellerId)
}
