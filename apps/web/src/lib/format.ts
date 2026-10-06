import { businessTimeZone, formatBrDate } from "@crm/contract"
import type { DateTime } from "effect"

// Typing fills the value from the right, like a cash register: "8", "89", "890" -> R$ 0,08, R$ 0,89, R$ 8,90.
export const centsFromInput = (text: string) => {
  const digits = text.replace(/\D/g, "").replace(/^0+/, "").slice(0, 11)
  return digits === "" ? 0 : Number(digits)
}

export const phoneDigits = (value: string) => value.replace(/\D/g, "").slice(0, 11)

export const formatPhone = (digits: string) => {
  if (digits.length === 0) return ""
  const area = digits.slice(0, 2)
  if (digits.length <= 2) return `(${area}`
  const localLength = digits.length === 11 ? 5 : 4
  const first = digits.slice(2, 2 + localLength)
  const rest = digits.slice(2 + localLength)
  return rest ? `(${area}) ${first}-${rest}` : `(${area}) ${first}`
}

const saoPauloDate = new Intl.DateTimeFormat("pt-BR", {
  timeZone: businessTimeZone,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
})

// A calendar date ("2026-10-15") has no time zone, so it is reordered as text; converting it through Date would shift it a day west of UTC.
export const formatDate = (value: string | DateTime.Utc) => {
  if (typeof value !== "string") return saoPauloDate.format(value.epochMilliseconds)
  return formatBrDate(value)
}

const saoPauloDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: businessTimeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

const saoPauloTime = new Intl.DateTimeFormat("pt-BR", {
  timeZone: businessTimeZone,
  hour: "2-digit",
  minute: "2-digit",
})

const monthAbbreviations = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
]

// Days are compared as São Paulo calendar dates ("2026-10-05"), so "Hoje" and "Ontem" follow the local midnight, not the UTC one.
export const formatRelative = (
  value: DateTime.Utc,
  style: "long" | "short",
  now: number = Date.now(),
) => {
  const day = saoPauloDay.format(value.epochMilliseconds)
  const today = saoPauloDay.format(now)
  const daysAgo = (Date.parse(today) - Date.parse(day)) / 86_400_000
  const time = saoPauloTime.format(value.epochMilliseconds)
  // A client clock slightly behind the server yields a negative difference, which still means today.
  if (daysAgo <= 0) return style === "long" ? `Hoje, ${time}` : `Hoje às ${time}`
  if (daysAgo === 1) return style === "long" ? `Ontem, ${time}` : "Ontem"
  const [year, month, dayOfMonth] = day.split("-")
  const dayMonth = `${Number(dayOfMonth)} ${monthAbbreviations[Number(month) - 1]}`
  const isThisYear = year === today.slice(0, 4)
  const date = isThisYear ? dayMonth : `${dayMonth} ${year}`
  return style === "long" ? `${date}, ${time}` : date
}

export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
