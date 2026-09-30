import { CrmApi, CurrentUser, hasPermission } from "@crm/contract"
import { Effect } from "effect"
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi"
import { failUnavailable } from "../platform/unavailable.ts"
import { SellersRepository } from "./repository.ts"

export const SellersLive = HttpApiBuilder.group(CrmApi, "sellers", (handlers) =>
  Effect.gen(function* () {
    const sellers = yield* SellersRepository

    return handlers.handle("list", () =>
      Effect.gen(function* () {
        const user = yield* CurrentUser
        if (!hasPermission(user, "lead.see_all") && !hasPermission(user, "lead.assign_any"))
          return yield* new HttpApiError.Forbidden()
        return yield* sellers.list()
      }).pipe(Effect.catchTag("SqlError", failUnavailable)),
    )
  }),
)
