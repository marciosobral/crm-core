import { CrmApi, CurrentUser, hasPermission, InvalidLeadSeller } from "@crm/contract"
import { Effect } from "effect"
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi"
import { requirePermission } from "#src/auth/permissions.ts"
import { activityScopeOf, leadScopeOf } from "#src/auth/scope.ts"
import { failUnavailable, nullIfBlank } from "#src/platform/http.ts"
import { SellersRepository } from "#src/sellers/repository.ts"
import { LeadsRepository } from "./repository.ts"

export const LeadsLive = HttpApiBuilder.group(CrmApi, "leads", (handlers) =>
  Effect.gen(function* () {
    const leads = yield* LeadsRepository
    const sellers = yield* SellersRepository

    return handlers
      .handle("list", ({ query }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const scope = leadScopeOf(user)
          const asksForAnotherSeller =
            scope.sellerId !== undefined &&
            query.sellerId !== undefined &&
            query.sellerId !== scope.sellerId
          if (asksForAnotherSeller) return []
          const sellerId = query.sellerId ?? scope.sellerId
          return yield* leads.list({
            ...(sellerId === undefined ? {} : { sellerId }),
            ...(query.search === undefined ? {} : { search: query.search }),
            ...(query.status === undefined ? {} : { status: query.status }),
            ...activityScopeOf(user),
          })
        }).pipe(Effect.catchTag("SqlError", failUnavailable)),
      )
      .handle("create", ({ payload }) =>
        Effect.gen(function* () {
          const user = yield* requirePermission("lead.create")
          let sellerId = user.id
          if (hasPermission(user, "lead.assign_any")) {
            if (payload.sellerId === undefined || !(yield* sellers.isSeller(payload.sellerId)))
              return yield* new InvalidLeadSeller()
            sellerId = payload.sellerId
          } else if (payload.sellerId !== undefined) {
            return yield* new HttpApiError.Forbidden()
          }
          const lead = yield* leads.create({
            name: payload.name,
            company: payload.company,
            email: payload.email,
            phone: payload.phone,
            jobTitle: nullIfBlank(payload.jobTitle),
            source: payload.source,
            notes: nullIfBlank(payload.notes),
            sellerId,
            createdBy: user.id,
          })
          yield* Effect.logInfo("Lead created").pipe(Effect.annotateLogs({ leadId: lead.id }))
          return lead
        }).pipe(Effect.catchTag("SqlError", failUnavailable)),
      )
  }),
)
