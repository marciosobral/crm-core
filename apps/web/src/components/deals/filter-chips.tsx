import {
  type DealFilters,
  dateRangePhrase,
  dealStatusLabels,
  idleDaysPhrase,
  valueRangePhrase,
} from "@crm/contract"
import { X } from "lucide-react"
import { formatDate } from "#src/lib/format.ts"

export type ChipFilterKey = Exclude<keyof DealFilters, "search" | "sellerId">

type Chip = { keys: ReadonlyArray<ChipFilterKey>; label: string }

const idleDaysChip = (days: number) => {
  const phrase = idleDaysPhrase(days)
  return `${phrase.charAt(0).toUpperCase()}${phrase.slice(1)}`
}

const prefixed = (prefix: string, phrase: string | undefined) =>
  phrase === undefined ? undefined : `${prefix} ${phrase}`

const chipsOf = (filters: DealFilters): ReadonlyArray<Chip> => {
  const candidates: ReadonlyArray<{
    keys: ReadonlyArray<ChipFilterKey>
    label: string | undefined
  }> = [
    {
      keys: ["statuses"],
      label: filters.statuses?.map((status) => dealStatusLabels[status]).join(", "),
    },
    {
      keys: ["minValueCents", "maxValueCents"],
      label: valueRangePhrase(filters.minValueCents, filters.maxValueCents),
    },
    {
      keys: ["idleDays"],
      label: filters.idleDays === undefined ? undefined : idleDaysChip(filters.idleDays),
    },
    {
      keys: ["closeFrom", "closeTo"],
      label: prefixed("Fecha", dateRangePhrase(filters.closeFrom, filters.closeTo, formatDate)),
    },
    {
      keys: ["closedFrom", "closedTo"],
      label: prefixed("Fechado", dateRangePhrase(filters.closedFrom, filters.closedTo, formatDate)),
    },
  ]
  return candidates.flatMap(({ keys, label }) => (label === undefined ? [] : [{ keys, label }]))
}

type FilterChipsProps = {
  filters: DealFilters
  onRemove: (keys: ReadonlyArray<ChipFilterKey>) => void
}

export function FilterChips({ filters, onRemove }: FilterChipsProps) {
  const chips = chipsOf(filters)
  if (chips.length === 0) return null

  return (
    <ul aria-label="Filtros aplicados" className="flex min-w-0 flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <li
          key={chip.label}
          className="flex items-center gap-1 rounded-full border border-line bg-canvas py-1 pr-1 pl-3 text-xs text-zinc-100"
        >
          {chip.label}
          <button
            type="button"
            aria-label={`Remover filtro: ${chip.label}`}
            className="rounded-full p-1 text-muted hover:bg-line hover:text-white focus-visible:outline-2 focus-visible:outline-brand"
            onClick={() => onRemove(chip.keys)}
          >
            <X className="size-3" aria-hidden="true" />
          </button>
        </li>
      ))}
      <li>
        <button
          type="button"
          className="rounded-md px-2 py-1 text-xs font-semibold text-muted hover:text-white focus-visible:outline-2 focus-visible:outline-brand"
          onClick={() => onRemove(chips.flatMap((chip) => chip.keys))}
        >
          Limpar filtros
        </button>
      </li>
    </ul>
  )
}
