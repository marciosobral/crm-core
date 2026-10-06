import { formatDealValue } from "./money.ts"

export const idleDaysPhrase = (days: number) => `sem contato há ${days}+ dias`

export const valueRangePhrase = (
  min: number | undefined,
  max: number | undefined,
  format: (cents: number) => string = formatDealValue,
) => {
  if (min !== undefined && max !== undefined) return `${format(min)} a ${format(max)}`
  if (min !== undefined) return `≥ ${format(min)}`
  if (max !== undefined) return `≤ ${format(max)}`
  return undefined
}

export const dateRangePhrase = (
  from: string | undefined,
  to: string | undefined,
  format: (calendarDate: string) => string,
) => {
  if (from !== undefined && to !== undefined)
    return from === to ? format(from) : `de ${format(from)} a ${format(to)}`
  if (from !== undefined) return `a partir de ${format(from)}`
  if (to !== undefined) return `até ${format(to)}`
  return undefined
}
