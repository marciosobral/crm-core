import { Seller } from "@crm/contract"
import { Effect } from "effect"
import { expect, it } from "vitest"
import {
  type DealSearchArguments,
  noDealSearch,
  type SearchContext,
  toLeadQuery,
  toSearchFilters,
} from "./search.ts"

const sellers = [
  new Seller({ id: "00000000-0000-4000-8000-00000000000a", name: "Ana Souza" }),
  new Seller({ id: "00000000-0000-4000-8000-00000000000b", name: "Bruno Lima" }),
  new Seller({ id: "00000000-0000-4000-8000-00000000000c", name: "Ana Costa" }),
]

const context: SearchContext = { today: "2026-10-15", sellers, canFilterBySeller: true }

const search = (args: Partial<DealSearchArguments>, overrides: Partial<SearchContext> = {}) =>
  Effect.runSync(toSearchFilters({ ...noDealSearch, ...args }, { ...context, ...overrides }))

const noDays = { days: null, from: null, to: null }

it("turns fully valid arguments into filters", () => {
  expect(
    search({
      statuses: ["NEGOTIATION", "PROPOSAL_SENT", "NEGOTIATION"],
      minValueCents: 5_000_000,
      maxValueCents: 9_000_000,
      idleDays: 7,
      expectedClose: { kind: "THIS_MONTH", ...noDays },
      closed: { kind: "LAST_DAYS", days: 30, from: null, to: null },
      sellerName: "bruno",
      search: "  academia  ",
    }),
  ).toEqual({
    filters: {
      statuses: ["NEGOTIATION", "PROPOSAL_SENT"],
      minValueCents: 5_000_000,
      maxValueCents: 9_000_000,
      idleDays: 7,
      closeFrom: "2026-10-01",
      closeTo: "2026-10-31",
      closedFrom: "2026-09-15",
      closedTo: "2026-10-15",
      sellerId: "00000000-0000-4000-8000-00000000000b",
      search: "academia",
    },
    ignored: [],
  })
})

it("returns no filters when nothing was understood", () => {
  expect(search({ statuses: [] })).toEqual({ filters: {}, ignored: [] })
})

it("ignores invalid numbers", () => {
  const result = search({ minValueCents: -1, maxValueCents: 1.5, idleDays: 400 })
  expect(result.filters).toEqual({})
  expect(result.ignored).toEqual(["INVALID_VALUE"])
  expect(search({ idleDays: 0 }).ignored).toEqual(["INVALID_VALUE"])
  expect(search({ idleDays: 365 }).filters).toEqual({ idleDays: 365 })
})

it("ignores values above the contract limit", () => {
  const result = search({ minValueCents: 100_000_000_000 })
  expect(result.filters).toEqual({})
  expect(result.ignored).toEqual(["INVALID_VALUE"])
})

it("ignores periods that cannot be resolved", () => {
  const result = search({
    expectedClose: { kind: "NEXT_DAYS", days: 0, from: null, to: null },
    closed: { kind: "BETWEEN", ...noDays },
  })
  expect(result.filters).toEqual({})
  expect(result.ignored).toEqual(["INVALID_PERIOD"])
})

it("drops an inverted value range and keeps the rest", () => {
  const result = search({ minValueCents: 9_000_000, maxValueCents: 1_000_000, idleDays: 3 })
  expect(result.filters).toEqual({ idleDays: 3 })
  expect(result.ignored).toEqual(["INVERTED_RANGE"])
})

it("reports invalid values before comparing a range", () => {
  const result = search({ minValueCents: -1, maxValueCents: -5 })
  expect(result.filters).toEqual({})
  expect(result.ignored).toEqual(["INVALID_VALUE"])
})

it("drops an inverted period-derived range", () => {
  const result = search({
    expectedClose: { kind: "BETWEEN", days: null, from: "2026-12-01", to: "2026-11-01" },
    closed: { kind: "BETWEEN", days: null, from: "2026-05-01", to: null },
  })
  expect(result.filters).toEqual({ closedFrom: "2026-05-01" })
  expect(result.ignored).toEqual(["INVERTED_RANGE"])
})

it("reports sellers that are unknown, ambiguous or not allowed", () => {
  expect(search({ sellerName: "Carlos" }).ignored).toEqual(["UNKNOWN_SELLER"])
  expect(search({ sellerName: "ana" }).ignored).toEqual(["AMBIGUOUS_SELLER"])
  const unavailable = search({ sellerName: "bruno" }, { sellers: [], canFilterBySeller: false })
  expect(unavailable.filters).toEqual({})
  expect(unavailable.ignored).toEqual(["SELLER_FILTER_UNAVAILABLE"])
})

it("drops a blank search silently and lists each ignored code once", () => {
  const blank = search({ search: "   " })
  expect(blank.filters).toEqual({})
  expect(blank.ignored).toEqual([])
  const repeated = search({ minValueCents: -1, idleDays: 0, sellerName: "Carlos" })
  expect(repeated.ignored).toEqual(["INVALID_VALUE", "UNKNOWN_SELLER"])
})

const leadQuery = (args: { status?: "NEW"; sellerName?: string; search?: string }) =>
  Effect.runSync(toLeadQuery({ status: null, sellerName: null, search: null, ...args }, context))

it("builds the lead query and reports what it could not apply", () => {
  expect(leadQuery({ status: "NEW", sellerName: "bruno", search: " acme " })).toEqual({
    query: { status: "NEW", sellerId: "00000000-0000-4000-8000-00000000000b", search: "acme" },
    ignored: [],
  })
  expect(leadQuery({ sellerName: "Carlos", search: "a".repeat(101) })).toEqual({
    query: {},
    ignored: ["UNKNOWN_SELLER", "INVALID_VALUE"],
  })
})
