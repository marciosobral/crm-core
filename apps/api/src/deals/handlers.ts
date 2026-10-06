import {
  CrmApi,
  CurrentUser,
  DealClosed,
  DealDetails,
  hasPermission,
  InvalidDealLead,
  InvalidDealSeller,
  isClosedStatus,
  type User,
} from "@crm/contract"
import { Effect, Option } from "effect"
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi"
import { Assistant } from "#src/assistant/service.ts"
import { requirePermission } from "#src/auth/permissions.ts"
import { activityScopeOf, dealScopeOf } from "#src/auth/scope.ts"
import { LeadsRepository } from "#src/leads/repository.ts"
import { failUnavailable, nullIfBlank } from "#src/platform/http.ts"
import { businessTime } from "#src/platform/time.ts"
import { SellersRepository } from "#src/sellers/repository.ts"
import { DealsRepository } from "./repository.ts"

export const DealsLive = HttpApiBuilder.group(CrmApi, "deals", (handlers) =>
  Effect.gen(function* () {
    const deals = yield* DealsRepository
    const sellers = yield* SellersRepository
    const leads = yield* LeadsRepository
    const assistant = yield* Assistant
    const { businessNow, businessToday } = yield* businessTime

    const findVisibleDeal = (user: User, id: string) =>
      Effect.gen(function* () {
        const deal = yield* deals.findById(id, dealScopeOf(user))
        if (Option.isNone(deal)) return yield* new HttpApiError.NotFound()
        return deal.value
      })

    return handlers
      .handle("list", ({ query }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const scope = dealScopeOf(user)
          const asksForAnotherSeller =
            scope.sellerId !== undefined &&
            query.sellerId !== undefined &&
            query.sellerId !== scope.sellerId
          if (asksForAnotherSeller) return []
          const sellerId = query.sellerId ?? scope.sellerId
          const today = yield* businessToday
          return yield* deals.list(
            { ...query, ...(sellerId === undefined ? {} : { sellerId }) },
            today,
          )
        }).pipe(Effect.catchTag("SqlError", failUnavailable)),
      )
      .handle("get", ({ params }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const deal = yield* findVisibleDeal(user, params.id)
          const lead = yield* leads.findById(deal.lead.id, activityScopeOf(user))
          if (Option.isNone(lead)) return yield* Effect.die(new Error("Deal lead not found"))
          return new DealDetails({ deal, lead: lead.value })
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
          yield* findVisibleDeal(user, params.id)
          const moved = yield* deals.moveOpen(params.id, payload.status, user.id)
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
          yield* findVisibleDeal(user, params.id)
          const closed = yield* deals.close(
            params.id,
            payload.result === "WON"
              ? { status: "WON" }
              : { status: "LOST", lostReason: payload.reason, lostNote: nullIfBlank(payload.note) },
            user.id,
          )
          if (Option.isNone(closed)) return yield* new DealClosed()
          yield* Effect.logInfo("Deal closed").pipe(
            Effect.annotateLogs({ dealId: params.id, result: payload.result }),
          )
          return closed.value
        }).pipe(Effect.catchTag("SqlError", failUnavailable)),
      )
      .handle("listActivities", ({ params }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          yield* findVisibleDeal(user, params.id)
          return yield* deals.listActivities(params.id)
        }).pipe(Effect.catchTag("SqlError", failUnavailable)),
      )
      .handle("comment", ({ params, payload }) =>
        Effect.gen(function* () {
          const user = yield* requirePermission("deal.comment")
          yield* findVisibleDeal(user, params.id)
          const comment = yield* deals.addComment({
            dealId: params.id,
            authorId: user.id,
            body: payload.body,
          })
          yield* Effect.logInfo("Deal comment added").pipe(
            Effect.annotateLogs({ dealId: params.id }),
          )
          return comment
        }).pipe(Effect.catchTag("SqlError", failUnavailable)),
      )
      .handle("suggestNextStep", ({ params }) =>
        Effect.gen(function* () {
          const user = yield* requirePermission("deal.suggest")
          const deal = yield* findVisibleDeal(user, params.id)
          if (isClosedStatus(deal.status)) return yield* new DealClosed()
          const activities = yield* deals.listActivities(params.id)
          const now = yield* businessNow
          return yield* assistant.suggestNextStep({ userId: user.id, deal, activities, now })
        }).pipe(Effect.catchTag("SqlError", failUnavailable)),
      )
  }),
)
