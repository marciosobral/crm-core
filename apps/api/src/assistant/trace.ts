import {
  DataToolName,
  type DealFilters,
  dateRangePhrase,
  dealStatusLabels,
  idleDaysPhrase,
  valueRangePhrase,
} from "@crm/contract"
import { Schema } from "effect"
import { formatBrlShort } from "./format.ts"

// What one data tool call asked and found, already in the words the user would use. It is stored
// with the reply and shown to the model on later turns, so follow-ups ("mostra", "e os fechados?")
// can continue the previous subject. It never holds ids or the user's own text.
export const ToolTraceEntry = Schema.Struct({
  tool: DataToolName,
  input: Schema.Array(Schema.String),
  result: Schema.Array(Schema.String),
})
export type ToolTraceEntry = typeof ToolTraceEntry.Type

export const ToolTrace = Schema.Array(ToolTraceEntry)
export type ToolTrace = typeof ToolTrace.Type

export interface TraceCollector {
  readonly add: (entry: ToolTraceEntry) => void
  readonly entries: () => ToolTrace
}

export const makeTraceCollector = (): TraceCollector => {
  const collected: Array<ToolTraceEntry> = []
  return { add: (entry) => collected.push(entry), entries: () => collected }
}

export const facts = (list: ReadonlyArray<readonly [string, string | null | undefined]>) =>
  list.flatMap(([label, value]) =>
    value === null || value === undefined || value === "" ? [] : [`${label}: ${value}`],
  )

export const dealFilterFacts = (filters: DealFilters, sellerName: string | null) =>
  facts([
    ["status", filters.statuses?.map((status) => dealStatusLabels[status]).join(", ")],
    ["valor", valueRangePhrase(filters.minValueCents, filters.maxValueCents, formatBrlShort)],
    ["parados", filters.idleDays === undefined ? null : idleDaysPhrase(filters.idleDays)],
    ["previsão de fechamento", dateRangePhrase(filters.closeFrom, filters.closeTo, (date) => date)],
    ["fechados em", dateRangePhrase(filters.closedFrom, filters.closedTo, (date) => date)],
    ["vendedor", sellerName],
  ])

export const ignoredFact = (ignored: ReadonlyArray<string>) =>
  facts([["filtros ignorados", ignored.join(", ")]])

export const traceText = (trace: ToolTrace) =>
  trace
    .map(({ tool, input, result }) => `- ${tool}(${input.join("; ")}) => ${result.join("; ")}`)
    .join("\n")
