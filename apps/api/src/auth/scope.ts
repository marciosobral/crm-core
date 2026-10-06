import { hasPermission, type User } from "@crm/contract"

export const dealScopeOf = (user: User): { readonly sellerId?: string } =>
  hasPermission(user, "deal.see_all") ? {} : { sellerId: user.id }

// A lead's deals can be assigned to other sellers, so a user who cannot see every deal only gets
// the last activity of their own deals on it.
export const activityScopeOf = (user: User): { readonly activitySellerId?: string } =>
  hasPermission(user, "deal.see_all") ? {} : { activitySellerId: user.id }

export const leadScopeOf = (user: User) => ({
  ...(hasPermission(user, "lead.see_all") ? {} : { sellerId: user.id }),
  ...activityScopeOf(user),
})
