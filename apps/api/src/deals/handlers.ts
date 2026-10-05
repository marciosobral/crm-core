import {
  CrmApi,
  CurrentUser,
  DealClosed,
  DealDetails,
  hasPermission,
  InvalidDealLead,
  InvalidDealSeller,
} from "@crm/contract"
import { Effect, Option } from "effect"
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi"
import { requirePermission } from "#src/auth/permissions.ts"
import { LeadsRepository } from "#src/leads/repository.ts"
import { nullIfBlank } from "#src/platform/text.ts"
import { failUnavailable } from "#src/platform/unavailable.ts"
import { SellersRepository } from "#src/sellers/repository.ts"
import { DealsRepository } from "./repository.ts"

export const DealsLive = HttpApiBuilder.group(CrmApi, "deals", (handlers) =>
  Effect.gen(function* () {
    const deals = yield* DealsRepository
    const sellers = yield* SellersRepository
    const leads = yield* LeadsRepository

    return handlers
      .handle("list", ({ query }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const canSeeAll = hasPermission(user, "deal.see_all")
          if (!canSeeAll && query.sellerId !== undefined && query.sellerId !== user.id) return []
          const sellerId = query.sellerId ?? (canSeeAll ? undefined : user.id)
          return yield* deals.list({
            ...(sellerId === undefined ? {} : { sellerId }),
            ...(query.search === undefined ? {} : { search: query.search }),
          })
        }).pipe(Effect.catchTag("SqlError", failUnavailable)),
      )
      .handle("get", ({ params }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const scope = hasPermission(user, "deal.see_all") ? {} : { sellerId: user.id }
          const deal = yield* deals.findById(params.id, scope)
          if (Option.isNone(deal)) return yield* new HttpApiError.NotFound()
          const lead = yield* leads.findById(deal.value.lead.id)
          if (Option.isNone(lead)) return yield* Effect.die(new Error("Deal lead not found"))
          return new DealDetails({ deal: deal.value, lead: lead.value })
        }).pipe(Effect.catchTag("SqlError", failUnavailable)),
      )
      .handle("create", ({ payload }) =>
        Effect.gen(function* () {
          const user = yield* requirePermission("deal.create")
          const canAssign = hasPermission(user, "deal.assign_any")
          if (!canAssign && payload.sellerId !== undefined)
            return yield* new HttpApiError.Forbidden()
          const leadSellerId = yield* deals.findLeadSellerId(payload.leadId)
          if (
            Option.isNone(leadSellerId) ||
            (!hasPermission(user, "lead.see_all") && leadSellerId.value !== user.id)
          )
            return yield* new InvalidDealLead()
          const sellerId = payload.sellerId ?? leadSellerId.value
          if (payload.sellerId !== undefined && !(yield* sellers.isSeller(payload.sellerId)))
            return yield* new InvalidDealSeller()
          const deal = yield* deals.create({
            title: payload.title,
            valueCents: payload.valueCents,
            status: payload.status,
            expectedCloseDate: payload.expectedCloseDate ?? null,
            description: nullIfBlank(payload.description),
            leadId: payload.leadId,
            sellerId,
            createdBy: user.id,
          })
          yield* Effect.logInfo("Deal created").pipe(Effect.annotateLogs({ dealId: deal.id }))
          return deal
        }).pipe(Effect.catchTag("SqlError", failUnavailable)),
      )
      .handle("move", ({ params, payload }) =>
        Effect.gen(function* () {
          const user = yield* requirePermission("deal.move")
          const scope = hasPermission(user, "deal.see_all") ? {} : { sellerId: user.id }
          if (Option.isNone(yield* deals.findById(params.id, scope)))
            return yield* new HttpApiError.NotFound()
          const moved = yield* deals.moveOpen(params.id, payload.status)
          if (Option.isNone(moved)) return yield* new DealClosed()
          yield* Effect.logInfo("Deal moved").pipe(
            Effect.annotateLogs({ dealId: params.id, status: payload.status }),
          )
          return moved.value
        }).pipe(Effect.catchTag("SqlError", failUnavailable)),
      )
      .handle("close", ({ params, payload }) =>
        Effect.gen(function* () {
          const user = yield* requirePermission("deal.close")
          const scope = hasPermission(user, "deal.see_all") ? {} : { sellerId: user.id }
          if (Option.isNone(yield* deals.findById(params.id, scope)))
            return yield* new HttpApiError.NotFound()
          const closed = yield* deals.close(
            params.id,
            payload.result === "WON"
              ? { status: "WON" }
              : { status: "LOST", lostReason: payload.reason, lostNote: nullIfBlank(payload.note) },
          )
          if (Option.isNone(closed)) return yield* new DealClosed()
          yield* Effect.logInfo("Deal closed").pipe(
            Effect.annotateLogs({ dealId: params.id, result: payload.result }),
          )
          return closed.value
        }).pipe(Effect.catchTag("SqlError", failUnavailable)),
      )
  }),
)
