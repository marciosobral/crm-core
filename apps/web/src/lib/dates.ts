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
