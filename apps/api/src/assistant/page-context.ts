import {
  type AssistantPageContext,
  type DealFilters,
  dateRangePhrase,
  dealStatusLabels,
  formatBrDate,
  hasPermission,
  idleDaysPhrase,
  type ListLeadsQuery,
  type Seller,
  type User,
  valueRangePhrase,
} from "@crm/contract"
import { Context, Effect, Layer, Option } from "effect"
import type { SqlError } from "effect/unstable/sql"
import { dealScopeOf } from "#src/auth/scope.ts"
import { DealsRepository } from "#src/deals/repository.ts"
import { SellersRepository } from "#src/sellers/repository.ts"
import { formatBrl } from "./format.ts"

const describeDealFilters = (filters: DealFilters, sellers: ReadonlyArray<Seller>) => {
  const phrases: Array<string> = []
  if (filters.statuses !== undefined)
    phrases.push(`etapas: ${filters.statuses.map((status) => dealStatusLabels[status]).join(", ")}`)
  const valueRange = valueRangePhrase(filters.minValueCents, filters.maxValueCents, formatBrl)
  if (valueRange !== undefined) phrases.push(`valor ${valueRange}`)
  if (filters.idleDays !== undefined) phrases.push(idleDaysPhrase(filters.idleDays))
  const closeRange = dateRangePhrase(filters.closeFrom, filters.closeTo, formatBrDate)
  if (closeRange !== undefined) phrases.push(`previsão de fechamento ${closeRange}`)
  const closedRange = dateRangePhrase(filters.closedFrom, filters.closedTo, formatBrDate)
  if (closedRange !== undefined) phrases.push(`fechados ${closedRange}`)
  if (filters.search !== undefined) phrases.push(`busca: ${filters.search}`)
  const sellerName = sellers.find(({ id }) => id === filters.sellerId)?.name
  if (sellerName !== undefined) phrases.push(`vendedor: ${sellerName}`)
  return phrases
}

const describeLeadFilters = (
  filters: typeof ListLeadsQuery.Type,
  sellers: ReadonlyArray<Seller>,
) => {
  const phrases: Array<string> = []
  if (filters.status !== undefined) phrases.push(`etapa: ${dealStatusLabels[filters.status]}`)
  if (filters.search !== undefined) phrases.push(`busca: ${filters.search}`)
  const sellerName = sellers.find(({ id }) => id === filters.sellerId)?.name
  if (sellerName !== undefined) phrases.push(`vendedor: ${sellerName}`)
  return phrases
}

const withFilters = (where: string, filters: ReadonlyArray<string>) =>
  `${where}${filters.length === 0 ? " sem filtros" : ` com os filtros: ${filters.join("; ")}`}.`

export interface CurrentPage {
  // Plain-text description of what the user is looking at, or null when there is nothing to say.
  readonly description: string | null
  // Set only when the page's deal exists and is visible to the user.
  readonly dealId: string | null
}

const noPage: CurrentPage = { description: null, dealId: null }

// Turns what the web says about the current page into text for the model. Only ids and filters are
// taken from the client: a deal is reloaded inside the user's scope and silently ignored when it
// is not visible, and seller names come from the database.
export class PageContext extends Context.Service<
  PageContext,
  {
    readonly describe: (
      user: User,
      context: AssistantPageContext | undefined,
    ) => Effect.Effect<CurrentPage, SqlError.SqlError>
  }
>()("crm/PageContext") {}

export const PageContextLive = Layer.effect(
  PageContext,
  Effect.gen(function* () {
    const deals = yield* DealsRepository
    const sellers = yield* SellersRepository

    const describe = (user: User, context: AssistantPageContext | undefined) =>
      Effect.gen(function* () {
        if (context === undefined) return noPage
        switch (context.page) {
          case "DEAL": {
            const deal = yield* deals.findById(context.dealId, dealScopeOf(user))
            if (Option.isNone(deal)) return noPage
            const { id, title, status, valueCents, lead, seller } = deal.value
            return {
              description: `O usuário está vendo o negócio "${title}" (${dealStatusLabels[status]}), valor ${formatBrl(valueCents)}, lead ${lead.name} (${lead.company}), vendedor ${seller.name}.`,
              dealId: id,
            }
          }
          case "DEALS_BOARD": {
            const sellerList = hasPermission(user, "deal.see_all") ? yield* sellers.list() : []
            return {
              description: withFilters(
                "O usuário está no board de negócios",
                describeDealFilters(context.filters ?? {}, sellerList),
              ),
              dealId: null,
            }
          }
          case "LEADS": {
            const sellerList = hasPermission(user, "lead.see_all") ? yield* sellers.list() : []
            return {
              description: withFilters(
                "O usuário está na lista de leads",
                describeLeadFilters(context.filters ?? {}, sellerList),
              ),
              dealId: null,
            }
          }
          case "LEAD_NEW":
            return { description: "O usuário está na tela de novo lead.", dealId: null }
          case "DEAL_NEW":
            return { description: "O usuário está na tela de novo negócio.", dealId: null }
          case "OTHER":
            return noPage
        }
      })

    return PageContext.of({ describe })
  }),
)
