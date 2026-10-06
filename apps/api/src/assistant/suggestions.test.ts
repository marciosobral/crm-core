import type { User } from "@crm/contract"
import { expect, it } from "@effect/vitest"
import { Effect, Layer, Random } from "effect"
import { TestClock } from "effect/testing"
import { demoPassword, seededEmails, seededUserIds, sellerPassword } from "#src/testing/database.ts"
import {
  closeDeal,
  decodeStrings,
  getAs,
  repositoriesOn,
  seedDeal,
  userWith,
} from "#src/testing/fixtures.ts"
import { jsonOf, loginAs, makeTestApiWith } from "#src/testing/http.ts"
import { answeringModel } from "#src/testing/language-model.ts"
import { roundDownToRoundAmount, Suggestions, SuggestionsLive } from "./suggestions.ts"

const today = "2026-10-15T15:00:00Z"

const isHowTo = (text: string) => text.startsWith("Como ")

const pipelineQuestions = [
  "Quais negócios estão em negociação?",
  "Qual o negócio mais caro em aberto?",
  "Quais negócios abertos valem mais de R$ 10 mil?",
  "Quais negócios em negociação estão acima de R$ 10 mil?",
]
const attentionQuestions = [
  "Quais negócios estão sem contato há 7 dias?",
  "Quais negócios fecham este mês?",
]

const supervisorCategories = [
  ["Quanto vendemos este mês?", "Quanto foi vendido hoje?"],
  pipelineQuestions,
  attentionQuestions,
  ["Quantos leads temos?"],
  ["Qual vendedor tem mais leads?", "Quem mais vendeu este mês?"],
]

const sellerCategories = [
  ["Quanto vendi este mês?", "Quanto vendi hoje?"],
  pipelineQuestions,
  attentionQuestions,
  ["Quantos leads eu tenho?"],
  ["Como marco um negócio como ganho?", "Como crio um negócio?"],
]

const drawsFor = (
  suggestions: { readonly forUser: (user: User) => Effect.Effect<ReadonlyArray<string>, unknown> },
  user: User,
) =>
  Effect.forEach(
    Array.from({ length: 12 }, (_, seed) => seed),
    (seed) => suggestions.forUser(user).pipe(Random.withSeed(seed)),
  )

it.effect(
  "fills with how-to questions when the user has no data and keeps the API role-aware",
  () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(Date.parse(today))
      const { send } = yield* makeTestApiWith(answeringModel("Olá!"))
      const ana = yield* loginAs(send, seededEmails.ana, sellerPassword)
      const demo = yield* loginAs(send, seededEmails.demo, demoPassword)
      const suggestionsOf = (cookie: string) =>
        Effect.gen(function* () {
          const response = yield* getAs(send, cookie, "/assistant/suggestions")
          expect(response.status).toBe(200)
          return decodeStrings(yield* jsonOf(response))
        })

      for (const cookie of [ana, demo]) {
        const suggestions = yield* suggestionsOf(cookie)
        expect(suggestions).toHaveLength(5)
        expect(new Set(suggestions).size).toBe(5)
        expect(suggestions.every(isHowTo)).toBe(true)
      }
      expect((yield* getAs(send, undefined, "/assistant/suggestions")).status).toBe(401)
    }).pipe(Effect.scoped),
)

it.effect("draws one question per category in order, with the wording of each role", () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(Date.parse(today))
    const { send, sql } = yield* makeTestApiWith(answeringModel("Olá!"))
    const ana = yield* loginAs(send, seededEmails.ana, sellerPassword)
    const ids = yield* seededUserIds(sql)
    const alfa = yield* seedDeal(send, ana, "Academia Alfa", 5_000_000, "NEGOTIATION")
    const beta = yield* seedDeal(send, ana, "Academia Beta", 1_000_000, "NEGOTIATION")
    const gama = yield* seedDeal(send, ana, "Academia Gama", 2_000_000)
    yield* sql`UPDATE deal_events SET created_at = '2026-10-14T15:00:00Z'`
    yield* sql`UPDATE deal_events SET created_at = '2026-10-05T15:00:00Z' WHERE deal_id = ${beta}`
    yield* closeDeal(sql, alfa, "WON", "2026-10-15T12:00:00Z")
    yield* sql`UPDATE deals SET expected_close_date = '2026-10-20' WHERE id = ${gama}`

    const suggestions = yield* Suggestions.pipe(
      Effect.provide(SuggestionsLive.pipe(Layer.provide(repositoriesOn(sql)))),
    )
    const checkRole = (
      categories: ReadonlyArray<ReadonlyArray<string>>,
      draws: ReadonlyArray<ReadonlyArray<string>>,
    ) => {
      for (const draw of draws) {
        expect(draw).toHaveLength(5)
        for (const [index, text] of draw.entries()) expect(categories[index]).toContain(text)
      }
      for (const [index, options] of categories.entries())
        expect(new Set(draws.map((draw) => draw[index])).size).toBe(options.length)
    }

    const supervisor = userWith("SUPERVISOR", ids.demo, "Demo")
    const supervisorDraws = yield* drawsFor(suggestions, supervisor)
    checkRole(supervisorCategories, supervisorDraws)
    expect(yield* suggestions.forUser(supervisor).pipe(Random.withSeed(3))).toEqual(
      supervisorDraws[3],
    )

    const seller = userWith("SELLER", ids.ana, "Ana Souza")
    const sellerDraws = yield* drawsFor(suggestions, seller)
    checkRole(sellerCategories, sellerDraws)
    expect(sellerDraws.flat()).not.toContain("Qual vendedor tem mais leads?")
    expect(sellerDraws.flat()).not.toContain("Quem mais vendeu este mês?")
  }).pipe(Effect.scoped),
)

it.effect("fills the categories without data with how-to questions, never repeating one", () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(Date.parse(today))
    const { send, sql } = yield* makeTestApiWith(answeringModel("Olá!"))
    const ana = yield* loginAs(send, seededEmails.ana, sellerPassword)
    const ids = yield* seededUserIds(sql)
    yield* seedDeal(send, ana, "Academia Alfa", 5_000_000)
    yield* sql`UPDATE deal_events SET created_at = '2026-10-14T15:00:00Z'`

    const suggestions = yield* Suggestions.pipe(
      Effect.provide(SuggestionsLive.pipe(Layer.provide(repositoriesOn(sql)))),
    )
    const draws = yield* drawsFor(suggestions, userWith("SELLER", ids.ana, "Ana Souza"))
    for (const draw of draws) {
      expect(draw).toHaveLength(5)
      expect(new Set(draw).size).toBe(5)
      expect([
        "Qual o negócio mais caro em aberto?",
        "Quais negócios abertos valem mais de R$ 50 mil?",
      ]).toContain(draw[0])
      expect(draw[1]).toBe("Quantos leads eu tenho?")
      expect(draw.slice(2).every(isHowTo)).toBe(true)
    }
  }).pipe(Effect.scoped),
)

it("rounds an amount down to a round one", () => {
  const reais = (amount: number) => amount * 100
  expect(roundDownToRoundAmount(reais(0.5))).toBe(50)
  expect(roundDownToRoundAmount(reais(7))).toBe(reais(7))
  expect(roundDownToRoundAmount(reais(87))).toBe(reais(80))
  expect(roundDownToRoundAmount(reais(1_999))).toBe(reais(1_000))
  expect(roundDownToRoundAmount(reais(87_500))).toBe(reais(80_000))
  expect(roundDownToRoundAmount(reais(99_999))).toBe(reais(90_000))
  expect(roundDownToRoundAmount(reais(100_000))).toBe(reais(100_000))
  expect(roundDownToRoundAmount(reais(347_800))).toBe(reais(340_000))
  expect(roundDownToRoundAmount(reais(1_290_000))).toBe(reais(1_200_000))
})

it.effect("asks about amounts taken from the deals in the user's own scope", () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(Date.parse(today))
    const { send, sql } = yield* makeTestApiWith(answeringModel("Olá!"))
    const ana = yield* loginAs(send, seededEmails.ana, sellerPassword)
    const bruno = yield* loginAs(send, seededEmails.bruno, sellerPassword)
    const ids = yield* seededUserIds(sql)
    yield* seedDeal(send, ana, "Academia Alfa", 8_700_000, "NEGOTIATION")
    yield* seedDeal(send, ana, "Academia Beta", 2_000_000)
    yield* seedDeal(send, bruno, "Academia Zeta", 180_000_000, "NEGOTIATION")
    yield* seedDeal(send, bruno, "Academia Eta", 150_000_000)

    const suggestions = yield* Suggestions.pipe(
      Effect.provide(SuggestionsLive.pipe(Layer.provide(repositoriesOn(sql)))),
    )
    const pipelineOf = (draws: ReadonlyArray<ReadonlyArray<string>>) => new Set(draws.flat())

    const anaPipeline = pipelineOf(
      yield* drawsFor(suggestions, userWith("SELLER", ids.ana, "Ana Souza")),
    )
    expect(anaPipeline).toContain("Quais negócios abertos valem mais de R$ 20 mil?")
    expect(anaPipeline).toContain("Quais negócios em negociação estão acima de R$ 80 mil?")

    const brunoPipeline = pipelineOf(
      yield* drawsFor(suggestions, userWith("SELLER", ids.bruno, "Bruno Lima")),
    )
    expect(brunoPipeline).toContain("Quais negócios abertos valem mais de R$ 1,5 mi?")
    expect(brunoPipeline).toContain("Quais negócios em negociação estão acima de R$ 1,8 mi?")

    const supervisorPipeline = pipelineOf(
      yield* drawsFor(suggestions, userWith("SUPERVISOR", ids.demo, "Demo")),
    )
    expect(supervisorPipeline).not.toContain("Quais negócios abertos valem mais de R$ 1,5 mi?")
  }).pipe(Effect.scoped),
)

it.effect("skips the negotiation amount question when nothing is in negotiation", () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(Date.parse(today))
    const { send, sql } = yield* makeTestApiWith(answeringModel("Olá!"))
    const ana = yield* loginAs(send, seededEmails.ana, sellerPassword)
    const ids = yield* seededUserIds(sql)
    yield* seedDeal(send, ana, "Academia Alfa", 8_700_000)

    const suggestions = yield* Suggestions.pipe(
      Effect.provide(SuggestionsLive.pipe(Layer.provide(repositoriesOn(sql)))),
    )
    const draws = yield* drawsFor(suggestions, userWith("SELLER", ids.ana, "Ana Souza"))
    expect(draws.flat().some((text) => text.includes("em negociação estão acima de"))).toBe(false)
    expect(draws.flat()).toContain("Quais negócios abertos valem mais de R$ 80 mil?")
  }).pipe(Effect.scoped),
)
