import { formatCents, formatDealValue } from "@crm/contract"
import { DateTime } from "effect"

// Intl separates "R$" from the number with a no-break space; the model copies plain spaces.
const withPlainSpaces = (text: string) => text.replaceAll("\u00A0", " ")

export const formatBrl = (cents: number) => withPlainSpaces(formatCents(cents))

// Without the cents when the amount is whole, like the deal cards.
export const formatBrlShort = (cents: number) => withPlainSpaces(formatDealValue(cents))

const compactBrl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
})

// "R$ 80 mil", "R$ 1,2 mi": how a person says an amount aloud.
export const formatBrlCompact = (cents: number) => withPlainSpaces(compactBrl.format(cents / 100))

export const formatMinute = (moment: DateTime.Zoned) => {
  const { year, month, day, hour, minute } = DateTime.toParts(moment)
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${year}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}`
}

export const formatDayMonth = (calendarDate: string) =>
  `${calendarDate.slice(8, 10)}/${calendarDate.slice(5, 7)}`
