import { hasPermission, type User } from "@crm/contract"

export const dealScopeOf = (user: User): { readonly sellerId?: string } =>
  hasPermission(user, "deal.see_all") ? {} : { sellerId: user.id }

export const activityScopeOf = (user: User): { readonly activitySellerId?: string } =>
  hasPermission(user, "deal.see_all") ? {} : { activitySellerId: user.id }

export const leadScopeOf = (user: User) => ({
  ...(hasPermission(user, "lead.see_all") ? {} : { sellerId: user.id }),
  ...activityScopeOf(user),
})
