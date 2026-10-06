import type { DateTime } from "effect"

const saoPauloDate = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
})

// A calendar date ("2026-10-15") has no time zone, so it is reordered as text; converting it through Date would shift it a day west of UTC.
export const formatDate = (value: string | DateTime.Utc) => {
  if (typeof value !== "string") return saoPauloDate.format(value.epochMilliseconds)
  const [year, month, day] = value.split("-")
  return `${day}/${month}/${year}`
}

const saoPauloDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

const saoPauloTime = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
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
  if (daysAgo === 0) return style === "long" ? `Hoje, ${time}` : `Hoje às ${time}`
  if (daysAgo === 1) return style === "long" ? `Ontem, ${time}` : "Ontem"
  const [year, month, dayOfMonth] = day.split("-")
  const date = `${Number(dayOfMonth)} ${monthAbbreviations[Number(month) - 1]}${year === today.slice(0, 4) ? "" : ` ${year}`}`
  return style === "long" ? `${date}, ${time}` : date
}
