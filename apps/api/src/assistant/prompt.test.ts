import { Deal, DealActivity } from "@crm/contract"
import { expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { nextStepPrompt } from "./prompt.ts"

const ana = { id: "00000000-0000-4000-8000-000000000001", name: "Ana Souza" }

const deal = Schema.decodeUnknownSync(Deal)({
  id: "00000000-0000-4000-8000-000000000010",
  title: "Academia X - Kit Completo",
  valueCents: 8_900_000,
  status: "NEGOTIATION",
  expectedCloseDate: "2026-11-30",
  description: null,
  lead: { id: "00000000-0000-4000-8000-000000000020", name: "Thiago Lima", company: "Academia X" },
  seller: ana,
  createdAt: "2026-10-01T12:00:00.000Z",
  lostReason: null,
  lostNote: null,
  closedAt: null,
})

const comment = (index: number) =>
  Schema.decodeUnknownSync(DealActivity)({
    kind: "COMMENT",
    id: `comment-${index}`,
    author: ana,
    createdAt: new Date(Date.UTC(2026, 9, 2, 0, index)).toISOString(),
    body: `Comentário ${index}`,
  })

const textOf = (deal: Deal, activities: ReadonlyArray<DealActivity>) =>
  JSON.stringify(nextStepPrompt(deal, activities))

it("describes the deal and lists the newest activities oldest first", () => {
  const newestFirst = Array.from({ length: 25 }, (_, index) => comment(24 - index))
  const text = textOf(deal, newestFirst)
  expect(text).toContain("Academia X - Kit Completo")
  expect(text).toContain("Thiago Lima (Academia X)")
  expect(text).toContain("Status: Negociação")
  expect(text).not.toContain("Comentário 4")
  expect(text).toContain("Comentário 5")
  expect(text.indexOf("Comentário 5")).toBeLessThan(text.indexOf("Comentário 24"))
})

it("states when the deal has no activity", () => {
  expect(textOf(deal, [])).toContain("No activity yet")
})
