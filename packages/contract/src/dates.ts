import { Schema } from "effect"

export const businessTimeZone = "America/Sao_Paulo"

// Calendar dates carry no zone, so UTC midnight keeps weekday and month arithmetic free of local offsets.
export const toUtcMidnight = (calendarDate: string) => new Date(`${calendarDate}T00:00:00Z`)

export const weekdayOf = (calendarDate: string) =>
  toUtcMidnight(calendarDate).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })

export const formatBrDate = (calendarDate: string) => calendarDate.split("-").reverse().join("/")

const isRealCalendarDate = (text: string) => {
  const date = toUtcMidnight(text)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text
}

export const CalendarDate = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/),
  Schema.makeFilter(isRealCalendarDate),
)
