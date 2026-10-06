import { expect, it } from "vitest"
import { type Period, resolvePeriod } from "./periods.ts"

const period = (kind: Period["kind"], rest: Partial<Period> = {}): Period => ({
  kind,
  days: null,
  from: null,
  to: null,
  ...rest,
})

it("resolves months, including month ends and the December to January rollover", () => {
  expect(resolvePeriod(period("THIS_MONTH"), "2026-01-31")).toEqual({
    from: "2026-01-01",
    to: "2026-01-31",
  })
  expect(resolvePeriod(period("THIS_MONTH"), "2028-02-10")).toEqual({
    from: "2028-02-01",
    to: "2028-02-29",
  })
  expect(resolvePeriod(period("NEXT_MONTH"), "2026-12-15")).toEqual({
    from: "2027-01-01",
    to: "2027-01-31",
  })
  expect(resolvePeriod(period("NEXT_MONTH"), "2026-01-31")).toEqual({
    from: "2026-02-01",
    to: "2026-02-28",
  })
  expect(resolvePeriod(period("LAST_MONTH"), "2026-01-15")).toEqual({
    from: "2025-12-01",
    to: "2025-12-31",
  })
})

it("resolves calendar quarters", () => {
  expect(resolvePeriod(period("THIS_QUARTER"), "2026-10-15")).toEqual({
    from: "2026-10-01",
    to: "2026-12-31",
  })
  expect(resolvePeriod(period("THIS_QUARTER"), "2026-03-31")).toEqual({
    from: "2026-01-01",
    to: "2026-03-31",
  })
  expect(resolvePeriod(period("LAST_QUARTER"), "2026-02-10")).toEqual({
    from: "2025-10-01",
    to: "2025-12-31",
  })
  expect(resolvePeriod(period("LAST_QUARTER"), "2026-10-15")).toEqual({
    from: "2026-07-01",
    to: "2026-09-30",
  })
})

it("starts weeks on Monday", () => {
  expect(resolvePeriod(period("THIS_WEEK"), "2026-10-04")).toEqual({
    from: "2026-09-28",
    to: "2026-10-04",
  })
  expect(resolvePeriod(period("THIS_WEEK"), "2026-10-05")).toEqual({
    from: "2026-10-05",
    to: "2026-10-11",
  })
  expect(resolvePeriod(period("THIS_WEEK"), "2026-10-07")).toEqual({
    from: "2026-10-05",
    to: "2026-10-11",
  })
})

it("resolves years", () => {
  expect(resolvePeriod(period("THIS_YEAR"), "2026-10-15")).toEqual({
    from: "2026-01-01",
    to: "2026-12-31",
  })
  expect(resolvePeriod(period("UNTIL_END_OF_YEAR"), "2026-10-15")).toEqual({
    from: "2026-10-15",
    to: "2026-12-31",
  })
})

it("resolves a number of days around today", () => {
  expect(resolvePeriod(period("NEXT_DAYS", { days: 15 }), "2026-10-15")).toEqual({
    from: "2026-10-15",
    to: "2026-10-30",
  })
  expect(resolvePeriod(period("NEXT_DAYS", { days: 1 }), "2026-12-31")).toEqual({
    from: "2026-12-31",
    to: "2027-01-01",
  })
  expect(resolvePeriod(period("LAST_DAYS", { days: 365 }), "2026-10-15")).toEqual({
    from: "2025-10-15",
    to: "2026-10-15",
  })
  expect(resolvePeriod(period("LAST_DAYS", { days: 1 }), "2026-03-01")).toEqual({
    from: "2026-02-28",
    to: "2026-03-01",
  })
})

it("rejects a day count outside 1 to 365 or not an integer", () => {
  for (const days of [0, 366, 1.5, -3, null]) {
    expect(resolvePeriod(period("NEXT_DAYS", { days }), "2026-10-15")).toBeNull()
    expect(resolvePeriod(period("LAST_DAYS", { days }), "2026-10-15")).toBeNull()
  }
})

it("resolves explicit dates with at least one end", () => {
  expect(
    resolvePeriod(period("BETWEEN", { from: "2026-11-01", to: "2026-11-30" }), "2026-10-15"),
  ).toEqual({ from: "2026-11-01", to: "2026-11-30" })
  expect(resolvePeriod(period("BETWEEN", { from: "2026-11-01" }), "2026-10-15")).toEqual({
    from: "2026-11-01",
  })
  expect(resolvePeriod(period("BETWEEN", { to: "2026-11-30" }), "2026-10-15")).toEqual({
    to: "2026-11-30",
  })
})

it("rejects explicit dates that are invalid or missing", () => {
  expect(resolvePeriod(period("BETWEEN"), "2026-10-15")).toBeNull()
  expect(resolvePeriod(period("BETWEEN", { from: "2026-02-30" }), "2026-10-15")).toBeNull()
  expect(
    resolvePeriod(period("BETWEEN", { from: "2026-11-01", to: "amanhã" }), "2026-10-15"),
  ).toBeNull()
})

it("resolves today and yesterday as single days, across month and year boundaries", () => {
  expect(resolvePeriod(period("TODAY"), "2026-10-15")).toEqual({
    from: "2026-10-15",
    to: "2026-10-15",
  })
  expect(resolvePeriod(period("YESTERDAY"), "2026-10-15")).toEqual({
    from: "2026-10-14",
    to: "2026-10-14",
  })
  expect(resolvePeriod(period("YESTERDAY"), "2026-01-01")).toEqual({
    from: "2025-12-31",
    to: "2025-12-31",
  })
})
