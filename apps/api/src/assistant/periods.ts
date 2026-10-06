import { CalendarDate, toUtcMidnight } from "@crm/contract"
import { Schema } from "effect"

export const Period = Schema.Struct({
  kind: Schema.Literals([
    "TODAY",
    "YESTERDAY",
    "THIS_WEEK",
    "THIS_MONTH",
    "NEXT_MONTH",
    "LAST_MONTH",
    "THIS_QUARTER",
    "LAST_QUARTER",
    "THIS_YEAR",
    "UNTIL_END_OF_YEAR",
    "NEXT_DAYS",
    "LAST_DAYS",
    "BETWEEN",
  ]),
  days: Schema.NullOr(Schema.Number),
  from: Schema.NullOr(Schema.String),
  to: Schema.NullOr(Schema.String),
})
export type Period = typeof Period.Type

export interface DateRange {
  readonly from?: string
  readonly to?: string
}

const isCalendarDate = Schema.is(CalendarDate)

// Day 0 of a month is the last day of the previous one, so fromUtc(y, m + 1, 0) is the last day of month m.
const fromUtc = (year: number, month: number, day: number) =>
  new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10)

const addDays = (date: string, days: number) => {
  const shifted = toUtcMidnight(date)
  shifted.setUTCDate(shifted.getUTCDate() + days)
  return shifted.toISOString().slice(0, 10)
}

const monthsRange = (date: string, monthOffset: number, monthCount: number): DateRange => {
  const today = toUtcMidnight(date)
  const year = today.getUTCFullYear()
  const month = today.getUTCMonth() + monthOffset
  return { from: fromUtc(year, month, 1), to: fromUtc(year, month + monthCount, 0) }
}

const isValidDayCount = (days: number | null): days is number =>
  days !== null && Number.isInteger(days) && days >= 1 && days <= 365

// Turns a period the model classified into concrete dates relative to `today`, or null when the
// period is unusable. The model never computes dates; this is the only place that does.
// Weeks start on Monday and quarters are calendar quarters.
export const resolvePeriod = (period: Period, today: string): DateRange | null => {
  const now = toUtcMidnight(today)
  const year = now.getUTCFullYear()
  const quarterStartMonth = Math.floor(now.getUTCMonth() / 3) * 3
  switch (period.kind) {
    case "TODAY":
      return { from: today, to: today }
    case "YESTERDAY": {
      const yesterday = addDays(today, -1)
      return { from: yesterday, to: yesterday }
    }
    case "THIS_WEEK": {
      const monday = addDays(today, -((now.getUTCDay() + 6) % 7))
      return { from: monday, to: addDays(monday, 6) }
    }
    case "THIS_MONTH":
      return monthsRange(today, 0, 1)
    case "NEXT_MONTH":
      return monthsRange(today, 1, 1)
    case "LAST_MONTH":
      return monthsRange(today, -1, 1)
    case "THIS_QUARTER":
      return {
        from: fromUtc(year, quarterStartMonth, 1),
        to: fromUtc(year, quarterStartMonth + 3, 0),
      }
    case "LAST_QUARTER":
      return {
        from: fromUtc(year, quarterStartMonth - 3, 1),
        to: fromUtc(year, quarterStartMonth, 0),
      }
    case "THIS_YEAR":
      return { from: fromUtc(year, 0, 1), to: fromUtc(year, 11, 31) }
    case "UNTIL_END_OF_YEAR":
      return { from: today, to: fromUtc(year, 11, 31) }
    // NEXT_DAYS and LAST_DAYS include today, so N days span N + 1 calendar dates.
    case "NEXT_DAYS":
      return isValidDayCount(period.days) ? { from: today, to: addDays(today, period.days) } : null
    case "LAST_DAYS":
      return isValidDayCount(period.days) ? { from: addDays(today, -period.days), to: today } : null
    case "BETWEEN": {
      const { from, to } = period
      if (from === null && to === null) return null
      if ((from !== null && !isCalendarDate(from)) || (to !== null && !isCalendarDate(to)))
        return null
      return { ...(from === null ? {} : { from }), ...(to === null ? {} : { to }) }
    }
  }
}
