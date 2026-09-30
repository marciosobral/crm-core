import { CurrentUser, hasPermission, type Permission } from "@crm/contract"
import { Effect } from "effect"
import { HttpApiError } from "effect/unstable/httpapi"

export const requirePermission = (permission: Permission) =>
  Effect.gen(function* () {
    const user = yield* CurrentUser
    if (!hasPermission(user, permission)) return yield* new HttpApiError.Forbidden()
    return user
  })
