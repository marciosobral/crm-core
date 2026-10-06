import { hasPermission, OpenDealStatus, type User } from "@crm/contract"
import { Context, Effect, Layer, Option, Random } from "effect"
import type { SqlError } from "effect/unstable/sql"
import { dealScopeOf, leadScopeOf } from "#src/auth/scope.ts"
import { DealsRepository } from "#src/deals/repository.ts"
import { LeadsRepository } from "#src/leads/repository.ts"
import { businessTime } from "#src/platform/time.ts"
import { SellersRepository } from "#src/sellers/repository.ts"
import { formatBrlCompact } from "./format.ts"
import { type DealSearchArguments, noDealSearch, toSearchFilters } from "./search.ts"

const maxSuggestions = 5
const idleThresholdDays = 7

const howToQuestions = [
  "Como marco um negócio como ganho?",
  "Como crio um negócio?",
  "Como crio um lead?",
  "Como movo um negócio no board?",
  "Como comento em um negócio?",
  "Como filtro o board?",
]

const centsPerReal = 100
const centsOf = (reais: number) => reais * centsPerReal

// A round amount that is never above `cents`, so a question about "more than" it has an answer:
// one significant digit under R$ 100 mil, R$ 10 mil steps up to R$ 1 mi, R$ 100 mil steps above.
export const roundDownToRoundAmount = (cents: number) => {
  if (cents >= centsOf(1_000_000)) return Math.floor(cents / centsOf(100_000)) * centsOf(100_000)
  if (cents >= centsOf(100_000)) return Math.floor(cents / centsOf(10_000)) * centsOf(10_000)
  let magnitude = 1
  while (magnitude * 10 <= cents) magnitude *= 10
  return Math.floor(cents / magnitude) * magnitude
}

interface Template {
  readonly text: string
  readonly applies: Effect.Effect<boolean, SqlError.SqlError>
}

// One question per category (sales, pipeline, attention, leads, and team for supervisors or how-to
// for sellers), drawn at random among the templates whose cheap existence check passes in the
// user's own scope. Missing picks are filled with other how-to questions, so the list reaches
// maxSuggestions whenever possible.
export class Suggestions extends Context.Service<
  Suggestions,
  { readonly forUser: (user: User) => Effect.Effect<ReadonlyArray<string>, SqlError.SqlError> }
>()("crm/Suggestions") {}

export const SuggestionsLive = Layer.effect(
  Suggestions,
  Effect.gen(function* () {
    const deals = yield* DealsRepository
    const leads = yield* LeadsRepository
    const sellers = yield* SellersRepository
    const { businessToday } = yield* businessTime

    const forUser = (user: User) =>
      Effect.gen(function* () {
        const today = yield* businessToday
        const searchFor = (args: Partial<DealSearchArguments>) =>
          toSearchFilters(
            { ...noDealSearch, ...args },
            { today, sellers: [], canFilterBySeller: false },
          ).pipe(Effect.map(({ filters }) => filters))
        const anyDeal = (args: Partial<DealSearchArguments>) =>
          Effect.flatMap(searchFor(args), (filters) =>
            deals.exists({ ...filters, ...dealScopeOf(user) }, today),
          )
        const thisMonth = { kind: "THIS_MONTH", days: null, from: null, to: null } as const
        const closedToday = { kind: "TODAY", days: null, from: null, to: null } as const
        const canSeeAll = hasPermission(user, "deal.see_all")
        const canSeeAllLeads = hasPermission(user, "lead.see_all")
        const anyLead = leads.exists(leadScopeOf(user))

        const roundMedianOf = (args: Partial<DealSearchArguments>) =>
          Effect.gen(function* () {
            const filters = yield* searchFor(args)
            const median = yield* deals.medianValueCents(
              { ...filters, ...dealScopeOf(user) },
              today,
            )
            return Option.map(median, roundDownToRoundAmount).pipe(
              Option.filter((threshold) => threshold > 0),
            )
          })
        const openThreshold = yield* roundMedianOf({ statuses: OpenDealStatus.literals })
        const negotiationThreshold = yield* roundMedianOf({ statuses: ["NEGOTIATION"] })
        const alwaysApplies = Effect.succeed(true)

        const sales: ReadonlyArray<Template> = [
          {
            text: canSeeAll ? "Quanto vendemos este mês?" : "Quanto vendi este mês?",
            applies: anyDeal({ statuses: ["WON"], closed: thisMonth }),
          },
          {
            text: canSeeAll ? "Quanto foi vendido hoje?" : "Quanto vendi hoje?",
            applies: anyDeal({ statuses: ["WON"], closed: closedToday }),
          },
        ]

        const pipeline: Array<Template> = [
          {
            text: "Quais negócios estão em negociação?",
            applies: anyDeal({ statuses: ["NEGOTIATION"] }),
          },
          {
            text: "Qual o negócio mais caro em aberto?",
            applies: anyDeal({ statuses: OpenDealStatus.literals }),
          },
        ]
        if (Option.isSome(openThreshold))
          pipeline.push({
            text: `Quais negócios abertos valem mais de ${formatBrlCompact(openThreshold.value)}?`,
            applies: alwaysApplies,
          })
        if (Option.isSome(negotiationThreshold))
          pipeline.push({
            text: `Quais negócios em negociação estão acima de ${formatBrlCompact(negotiationThreshold.value)}?`,
            applies: alwaysApplies,
          })

        const attention: ReadonlyArray<Template> = [
          {
            text: `Quais negócios estão sem contato há ${idleThresholdDays} dias?`,
            applies: anyDeal({ idleDays: idleThresholdDays }),
          },
          {
            text: "Quais negócios fecham este mês?",
            applies: anyDeal({ statuses: OpenDealStatus.literals, expectedClose: thisMonth }),
          },
        ]

        const leadCount: ReadonlyArray<Template> = [
          {
            text: canSeeAllLeads ? "Quantos leads temos?" : "Quantos leads eu tenho?",
            applies: anyLead,
          },
        ]

        const anySellerHasLeads = Effect.flatMap(sellers.list(), (rows) =>
          rows.length > 0 ? anyLead : Effect.succeed(false),
        )
        const team: ReadonlyArray<Template> = canSeeAll
          ? [
              { text: "Qual vendedor tem mais leads?", applies: anySellerHasLeads },
              {
                text: "Quem mais vendeu este mês?",
                applies: anyDeal({ statuses: ["WON"], closed: thisMonth }),
              },
            ]
          : howToQuestions.slice(0, 2).map((text) => ({ text, applies: alwaysApplies }))

        const categories = [sales, pipeline, attention, leadCount, team]

        const picks = yield* Effect.forEach(categories, (templates) =>
          Effect.gen(function* () {
            const applicable = yield* Effect.filter(templates, ({ applies }) => applies)
            const [pick] = yield* Random.shuffle(applicable)
            return pick?.text
          }),
        )
        const chosen = picks.filter((text) => text !== undefined)
        const spares = (yield* Random.shuffle(howToQuestions)).filter(
          (text) => !chosen.includes(text),
        )
        const missing = maxSuggestions - chosen.length
        return [...chosen, ...spares.slice(0, missing)]
      })

    return Suggestions.of({ forUser })
  }),
)
