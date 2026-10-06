import {
  type AssistantLink,
  dealStatusLabels,
  describeDealActivity,
  hasPermission,
  OpenDealStatus,
  type User,
} from "@crm/contract"
import { DateTime, Effect, Option } from "effect"
import type { SqlError } from "effect/unstable/sql"
import { formatBrl, formatMinute } from "#src/assistant/format.ts"
import type { LinkCollector } from "#src/assistant/links.ts"
import {
  openDealLabel,
  openScreenLabel,
  viewDealsLabel,
  viewLeadsLabel,
} from "#src/assistant/links.ts"
import {
  type IgnoredFilter,
  noDealSearch,
  type Owner,
  toLeadQuery,
  toSearchFilters,
} from "#src/assistant/search.ts"
import { ToolUnavailable } from "#src/assistant/service.ts"
import { dealFilterFacts, facts, ignoredFact, type TraceCollector } from "#src/assistant/trace.ts"
import { dealScopeOf, leadScopeOf } from "#src/auth/scope.ts"
import { DealsRepository } from "#src/deals/repository.ts"
import { LeadsRepository } from "#src/leads/repository.ts"
import { logSqlFailure } from "#src/platform/http.ts"
import { SellersRepository } from "#src/sellers/repository.ts"
import type { ToolParameters } from "./definitions.ts"

const ownerPhrases: Record<Owner, string> = { ME: "meus", TEAM: "equipe" }
const sortPhrases = { NEWEST: "mais recentes", VALUE_DESC: "maior valor", VALUE_ASC: "menor valor" }

const metricPhrases = {
  LEADS: "leads por vendedor",
  OPEN_DEALS: "negócios abertos",
  WON_COUNT: "negócios ganhos",
  WON_VALUE: "valor ganho",
}

const maxDefaultLinks = 3
const sampleSize = 5
const timelineSize = 10

// What every handler needs about the request. Scope comes from here and never from model
// arguments: a seller's queries are always restricted to their own deals and leads, whatever
// seller name the model passes. `currentDealId` is the deal on the user's page, already checked as
// visible.
export interface ToolContext {
  readonly user: User
  readonly links: LinkCollector
  readonly trace: TraceCollector
  readonly today: string
  readonly currentDealId: string | null
}

// The seller filter is the only one whose dropping leaves the result equal to what the link opens:
// the user's own scope. Any other dropped filter would make the button show different data.
const isLinkable = (ignored: ReadonlyArray<IgnoredFilter>) =>
  ignored.every((code) => code === "SELLER_FILTER_UNAVAILABLE")

const unavailable = (error: SqlError.SqlError) =>
  logSqlFailure(error).pipe(Effect.andThen(Effect.fail(new ToolUnavailable())))

// A user who sees everyone owns nothing, so owner ME has no records to narrow to: the tools answer
// with the team and flag it, unless a seller was named explicitly.
const ownerFallbackOf = (owner: Owner | null, canSeeAll: boolean, sellerId: string | undefined) =>
  owner === "ME" && canSeeAll && sellerId === undefined ? ("SUPERVISOR_TEAM" as const) : null

// A user who sees everyone owns nothing, so a button filtered by their id would open an empty list.
const ownsNothing = ({ user }: ToolContext, sellerId: string | undefined, canSeeAll: boolean) =>
  sellerId === user.id && canSeeAll

const sellerNameOf = (
  { user }: ToolContext,
  sellerId: string | undefined,
  sellerList: ReadonlyArray<{ readonly id: string; readonly name: string }>,
) => {
  if (sellerId === undefined) return null
  if (sellerId === user.id) return user.name
  return sellerList.find(({ id }) => id === sellerId)?.name ?? null
}

interface RankRow {
  readonly sellerName: string
  readonly count: number
  readonly valueCents: number
  readonly link: (count: number) => AssistantLink
}

export const makeToolHandlers = Effect.gen(function* () {
  const deals = yield* DealsRepository
  const leads = yield* LeadsRepository
  const sellers = yield* SellersRepository
  const zone = yield* DateTime.CurrentTimeZone

  const searchDeals = (context: ToolContext) => {
    const { user, links, trace, today } = context
    const canSeeAll = hasPermission(user, "deal.see_all")
    return (args: ToolParameters["searchDeals"]) =>
      Effect.gen(function* () {
        const sellerList = canSeeAll ? yield* sellers.list() : []
        const searched = yield* toSearchFilters(args, {
          today,
          sellers: sellerList,
          canFilterBySeller: canSeeAll,
        })
        const { ignored } = searched
        const { filters } = searched
        const ownerFallback = ownerFallbackOf(args.owner, canSeeAll, filters.sellerId)
        const sort = args.sort ?? "NEWEST"
        const found = yield* deals.summarize({ ...filters, ...dealScopeOf(user) }, today, {
          sort,
          limit: sampleSize,
        })
        const sellerName = sellerNameOf(context, filters.sellerId, sellerList)
        const canLink =
          isLinkable(ignored) &&
          found.count > 0 &&
          !ownsNothing(context, filters.sellerId, canSeeAll)
        // Registered before the sample rows so the filtered view gets the lowest id: the model
        // tends to offer L1, and the filtered view is the button the answer is about.
        const linkId = canLink
          ? links.add({
              kind: "VIEW_DEALS",
              label: viewDealsLabel(filters, found.count, sellerName),
              filters,
            })
          : null
        const [first] = found.sample
        const firstDeal =
          first === undefined
            ? null
            : `${first.title} (${formatBrl(first.valueCents)}, ${first.seller.name})`
        const ownerPhrase = args.owner === null ? null : ownerPhrases[args.owner]
        trace.add({
          tool: "searchDeals",
          input: [
            ...dealFilterFacts(filters, sellerName),
            ...facts([
              ["dono", ownerPhrase],
              ["ordem", sortPhrases[sort]],
            ]),
          ],
          result: [
            ...facts([
              ["quantidade", String(found.count)],
              ["valor total", formatBrl(found.totalValueCents)],
              ["primeiro", firstDeal],
            ]),
            ...ignoredFact(ignored),
          ],
        })
        return {
          count: found.count,
          totalValueFormatted: formatBrl(found.totalValueCents),
          sample: found.sample.map((deal) => ({
            dealId: deal.id,
            title: deal.title,
            valueFormatted: formatBrl(deal.valueCents),
            status: deal.status,
            sellerName: deal.seller.name,
            linkId: links.addLazy({
              kind: "OPEN_DEAL",
              label: openDealLabel(deal.title),
              dealId: deal.id,
            }),
          })),
          ignored,
          ownerFallback,
          linkId,
        }
      }).pipe(Effect.catchTag("SqlError", unavailable))
  }

  const summarizeSales = (context: ToolContext) => {
    const { user, links, trace, today } = context
    const canSeeAll = hasPermission(user, "deal.see_all")
    return ({ period, sellerName, owner }: ToolParameters["summarizeSales"]) =>
      Effect.gen(function* () {
        const sellerList = canSeeAll ? yield* sellers.list() : []
        const searched = yield* toSearchFilters(
          { ...noDealSearch, statuses: ["WON", "LOST"], closed: period, sellerName },
          { today, sellers: sellerList, canFilterBySeller: canSeeAll },
        )
        const { ignored } = searched
        // A dropped filter would widen the numbers silently, so nothing is counted instead.
        if (ignored.length > 0)
          return {
            wonCount: null,
            wonValueFormatted: null,
            lostCount: null,
            period: null,
            ignored,
            ownerFallback: null,
            linkId: null,
          }
        const { filters } = searched
        const summary = yield* deals.salesSummary({ ...filters, ...dealScopeOf(user) }, today)
        const closedCount = summary.wonCount + summary.lostCount
        const sellerFilterName = sellerNameOf(context, filters.sellerId, sellerList)
        trace.add({
          tool: "summarizeSales",
          input: [
            ...dealFilterFacts(filters, sellerFilterName),
            ...facts([["dono", owner === null ? null : ownerPhrases[owner]]]),
          ],
          result: facts([
            ["ganhos", `${summary.wonCount} (${formatBrl(summary.wonValueCents)})`],
            ["perdidos", String(summary.lostCount)],
          ]),
        })
        const canLink = closedCount > 0 && !ownsNothing(context, filters.sellerId, canSeeAll)
        const linkId = canLink
          ? links.add({
              kind: "VIEW_DEALS",
              label: viewDealsLabel(filters, closedCount, sellerFilterName),
              filters,
            })
          : null
        return {
          wonCount: summary.wonCount,
          wonValueFormatted: formatBrl(summary.wonValueCents),
          lostCount: summary.lostCount,
          period: { from: filters.closedFrom ?? null, to: filters.closedTo ?? null },
          ignored,
          ownerFallback: ownerFallbackOf(owner, canSeeAll, filters.sellerId),
          linkId,
        }
      }).pipe(Effect.catchTag("SqlError", unavailable))
  }

  const searchLeads = (context: ToolContext) => {
    const { user, links, trace, today } = context
    const canSeeAll = hasPermission(user, "lead.see_all")
    return (args: ToolParameters["searchLeads"]) =>
      Effect.gen(function* () {
        const sellerList = canSeeAll ? yield* sellers.list() : []
        const searched = yield* toLeadQuery(args, {
          today,
          sellers: sellerList,
          canFilterBySeller: canSeeAll,
        })
        const { ignored } = searched
        const { query } = searched
        const found = yield* leads.summarize({ ...query, ...leadScopeOf(user) }, sampleSize)
        const sellerName = sellerNameOf(context, query.sellerId, sellerList)
        trace.add({
          tool: "searchLeads",
          input: facts([
            ["status", query.status === undefined ? null : dealStatusLabels[query.status]],
            ["vendedor", sellerName],
            ["dono", args.owner === null ? null : ownerPhrases[args.owner]],
          ]),
          result: [...facts([["quantidade", String(found.count)]]), ...ignoredFact(ignored)],
        })
        const canLink =
          isLinkable(ignored) && found.count > 0 && !ownsNothing(context, query.sellerId, canSeeAll)
        const linkId = canLink
          ? links.add({
              kind: "VIEW_LEADS",
              label: viewLeadsLabel(query, found.count, sellerName),
              filters: query,
            })
          : null
        return {
          count: found.count,
          sample: found.sample.map(({ name, company }) => ({ name, company })),
          ignored,
          ownerFallback: ownerFallbackOf(args.owner, canSeeAll, query.sellerId),
          linkId,
        }
      }).pipe(Effect.catchTag("SqlError", unavailable))
  }

  const getDealTimeline =
    ({ user, links, trace, currentDealId }: ToolContext) =>
    ({ dealId }: ToolParameters["getDealTimeline"]) =>
      Effect.gen(function* () {
        const id = dealId ?? currentDealId
        const deal = id === null ? Option.none() : yield* deals.findById(id, dealScopeOf(user))
        if (Option.isNone(deal))
          return { found: false, dealTitle: null, activities: [], linkId: null }
        const newestFirst = yield* deals.listActivities(deal.value.id, timelineSize)
        trace.add({
          tool: "getDealTimeline",
          input: facts([["negócio", deal.value.title]]),
          result: facts([["atividades", String(newestFirst.length)]]),
        })
        return {
          found: true,
          dealTitle: deal.value.title,
          activities: newestFirst.toReversed().map((activity) => ({
            kind: activity.kind === "COMMENT" ? ("COMMENT" as const) : ("EVENT" as const),
            at: formatMinute(DateTime.setZone(activity.createdAt, zone)),
            author: activity.author.name,
            text: describeDealActivity(activity),
          })),
          linkId: links.add({
            kind: "OPEN_DEAL",
            label: openDealLabel(deal.value.title),
            dealId: deal.value.id,
          }),
        }
      }).pipe(Effect.catchTag("SqlError", unavailable))

  const rankSellers = ({ user, links, trace, today }: ToolContext) => {
    const canSeeAllLeads = hasPermission(user, "lead.see_all")
    return ({ metric, period }: ToolParameters["rankSellers"]) =>
      Effect.gen(function* () {
        const isValueMetric = metric === "WON_VALUE"
        const measure = (row: RankRow) => (isValueMetric ? row.valueCents : row.count)
        const measureText = (row: RankRow) =>
          isValueMetric ? formatBrl(row.valueCents) : String(row.count)

        // Sorting is stable, so sellers tied on the metric keep their alphabetical order. The
        // sellers tied at the top (never with zero) get a default link, so a reply that names none
        // still offers the answer; the others are offered only when the model references them.
        const rank = (rows: ReadonlyArray<RankRow>, inputFacts: ReadonlyArray<string>) => {
          const sorted = rows.toSorted((a, b) => measure(b) - measure(a))
          const [leader] = sorted
          const topMeasure = leader === undefined ? 0 : measure(leader)
          const topSellers =
            topMeasure > 0 ? sorted.filter((row) => measure(row) === topMeasure) : []
          const defaultLinked = topSellers.slice(0, maxDefaultLinks)
          const leaders = topSellers
            .map((row) => `${row.sellerName} (${measureText(row)})`)
            .join(", ")
          trace.add({
            tool: "rankSellers",
            input: [...facts([["métrica", metricPhrases[metric]]]), ...inputFacts],
            result: facts([
              ["vendedores", String(sorted.length)],
              ["primeiro", leaders],
            ]),
          })
          const linkIdOf = (row: RankRow) => {
            if (row.count === 0) return null
            const link = row.link(row.count)
            return defaultLinked.includes(row) ? links.add(link) : links.addLazy(link)
          }
          return sorted.map((row) => ({
            sellerName: row.sellerName,
            count: row.count,
            valueFormatted: isValueMetric ? formatBrl(row.valueCents) : null,
            linkId: linkIdOf(row),
          }))
        }

        const isWonMetric = metric === "WON_COUNT" || metric === "WON_VALUE"
        const periodIgnored =
          !isWonMetric && period !== null ? ["PERIOD_NOT_APPLICABLE" as const] : []
        if (metric === "LEADS") {
          // The toolkit is picked by deal.see_all, so lead.see_all is checked here on its own.
          if (!canSeeAllLeads)
            return { sellers: [], ignored: ["SELLER_FILTER_UNAVAILABLE" as const] }
          const rows = yield* leads.countBySeller()
          return {
            sellers: rank(
              rows.map(({ sellerId, sellerName, count }) => ({
                sellerName,
                count,
                valueCents: 0,
                link: (matching: number): AssistantLink => ({
                  kind: "VIEW_LEADS",
                  label: viewLeadsLabel({ sellerId }, matching, sellerName),
                  filters: { sellerId },
                }),
              })),
              [],
            ),
            ignored: periodIgnored,
          }
        }
        const { filters, ignored } = yield* toSearchFilters(
          {
            ...noDealSearch,
            statuses: isWonMetric ? ["WON"] : OpenDealStatus.literals,
            closed: isWonMetric ? period : null,
          },
          { today, sellers: [], canFilterBySeller: false },
        )
        // A period that could not be applied would rank over all time without saying so.
        if (ignored.length > 0) return { sellers: [], ignored }
        const { sellerId: _sellerId, ...withoutSeller } = filters
        const rows = yield* deals.rankSellers(withoutSeller, today)
        return {
          sellers: rank(
            rows.map(({ sellerId, sellerName, count, valueCents }) => ({
              sellerName,
              count,
              valueCents,
              link: (matching: number): AssistantLink => ({
                kind: "VIEW_DEALS",
                label: viewDealsLabel({ ...filters, sellerId }, matching, sellerName),
                filters: { ...filters, sellerId },
              }),
            })),
            dealFilterFacts(filters, null),
          ),
          ignored: [...ignored, ...periodIgnored],
        }
      }).pipe(Effect.catchTag("SqlError", unavailable))
  }

  const listSellers = () =>
    sellers.list().pipe(
      Effect.map((list) => ({ count: list.length, sellers: list.map(({ name }) => ({ name })) })),
      Effect.catchTag("SqlError", unavailable),
    )

  const openScreen =
    ({ links }: ToolContext) =>
    ({ screen }: ToolParameters["openScreen"]) =>
      Effect.succeed({
        linkId: links.add({ kind: "OPEN_SCREEN", label: openScreenLabel(screen), screen }),
      })

  return {
    searchDeals,
    summarizeSales,
    searchLeads,
    getDealTimeline,
    rankSellers,
    listSellers,
    openScreen,
  }
})
