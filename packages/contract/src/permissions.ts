import { Schema } from "effect"

export const Role = Schema.Literals(["SUPERVISOR", "SELLER"])
export type Role = typeof Role.Type

export const roleLabels: Record<Role, string> = {
  SUPERVISOR: "Supervisor",
  SELLER: "Vendedor",
}

export const Permission = Schema.Literals([
  "lead.create",
  "lead.see_all",
  "lead.assign_any",
  "deal.create",
  "deal.see_all",
  "deal.assign_any",
  "deal.move",
  "deal.close",
  "deal.comment",
  "deal.suggest",
  "assistant.chat",
])
export type Permission = typeof Permission.Type

export const rolePermissions: Record<Role, ReadonlyArray<Permission>> = {
  SUPERVISOR: [
    "lead.create",
    "lead.see_all",
    "lead.assign_any",
    "deal.create",
    "deal.see_all",
    "deal.assign_any",
    "deal.move",
    "deal.close",
    "deal.comment",
    "deal.suggest",
    "assistant.chat",
  ],
  SELLER: [
    "lead.create",
    "deal.create",
    "deal.move",
    "deal.close",
    "deal.comment",
    "deal.suggest",
    "assistant.chat",
  ],
}

export const hasPermission = (
  user: { readonly permissions: ReadonlyArray<Permission> },
  permission: Permission,
) => user.permissions.includes(permission)
