import {
  type AssistantLink,
  type AssistantScreen,
  type DealFilters,
  type DealStatus,
  dateRangePhrase,
  idleDaysPhrase,
  type ListLeadsQuery,
  OpenDealStatus,
  truncate,
  valueRangePhrase,
} from "@crm/contract"
import { formatBrlShort, formatDayMonth } from "./format.ts"
import { screenLabels } from "./guide.ts"

const maxReplyLinks = 3
const maxLabelLength = 52

const statusPhrases: Record<DealStatus, { singular: string; plural: string }> = {
  NEW: { singular: "novo", plural: "novos" },
  CONTACTED: { singular: "com contato feito", plural: "com contato feito" },
  PROPOSAL_SENT: { singular: "com proposta enviada", plural: "com proposta enviada" },
  NEGOTIATION: { singular: "em negociação", plural: "em negociação" },
  WON: { singular: "ganho", plural: "ganhos" },
  LOST: { singular: "perdido", plural: "perdidos" },
}

const plural = (count: number, singular: string, pluralForm: string) =>
  `${count} ${count === 1 ? singular : pluralForm}`

const isExactly = (statuses: ReadonlyArray<DealStatus>, expected: ReadonlyArray<DealStatus>) =>
  statuses.length === expected.length && expected.every((status) => statuses.includes(status))

const statusPhrase = (statuses: ReadonlyArray<DealStatus> = [], count: number) => {
  if (isExactly(statuses, OpenDealStatus.literals)) return count === 1 ? " aberto" : " abertos"
  if (isExactly(statuses, ["WON", "LOST"]))
    return count === 1 ? " ganho ou perdido" : " ganhos e perdidos"
  const [only, ...others] = statuses
  if (only === undefined || others.length > 0) return ""
  return ` ${count === 1 ? statusPhrases[only].singular : statusPhrases[only].plural}`
}

const prefixed = (prefix: string, phrase: string | undefined) =>
  phrase === undefined ? "" : `${prefix}${phrase}`

const closedPhrase = (range: string | undefined) => (range === undefined ? "" : ` (${range})`)

const sellerPhrase = (sellerName: string | null) => (sellerName === null ? "" : ` de ${sellerName}`)

// Adds each phrase in priority order and skips the ones that would overflow the label, so a long
// seller name never cuts a phrase in half.
const composeLabel = (base: string, phrases: ReadonlyArray<string>) => {
  let label = base
  for (const phrase of phrases) {
    const extended = label + phrase
    if (Array.from(extended).length <= maxLabelLength) label = extended
  }
  return truncate(label, maxLabelLength)
}

export const viewDealsLabel = (filters: DealFilters, count: number, sellerName: string | null) => {
  const phrases = [
    statusPhrase(filters.statuses, count),
    prefixed(" ", valueRangePhrase(filters.minValueCents, filters.maxValueCents, formatBrlShort)),
    sellerPhrase(sellerName),
    filters.idleDays === undefined ? "" : ` ${idleDaysPhrase(filters.idleDays)}`,
    prefixed(" fecham ", dateRangePhrase(filters.closeFrom, filters.closeTo, formatDayMonth)),
    closedPhrase(dateRangePhrase(filters.closedFrom, filters.closedTo, formatDayMonth)),
  ]
  return composeLabel(
    `Ver ${plural(count, "negócio", "negócios")}`,
    phrases.every((phrase) => phrase === "") ? [" no board"] : phrases,
  )
}

export const viewLeadsLabel = (
  filters: typeof ListLeadsQuery.Type,
  count: number,
  sellerName: string | null,
) =>
  composeLabel(`Ver ${plural(count, "lead", "leads")}`, [
    statusPhrase(filters.status === undefined ? [] : [filters.status], count),
    sellerPhrase(sellerName),
    filters.search === undefined ? "" : ` com "${filters.search}"`,
  ])

export const openDealLabel = (title: string) => truncate(`Abrir ${title}`, maxLabelLength)

export const openScreenLabel = (screen: AssistantScreen) =>
  truncate(`Ir para ${screenLabels[screen]}`, maxLabelLength)

const sortedKeys = (_key: string, value: unknown) =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
    : value

// Two links open the same place when they differ only by their label.
const destinationKey = (link: AssistantLink) => {
  const { label: _label, ...destination } = link
  return JSON.stringify(destination, sortedKeys)
}

interface CollectedLink {
  readonly id: string
  readonly link: AssistantLink
  readonly key: string
  isLazy: boolean
}

export interface LinkCollector {
  // A link the reply offers by default when the model references none.
  readonly add: (link: AssistantLink) => string
  // A link offered only when the model references its id, such as one deal among a sample.
  readonly addLazy: (link: AssistantLink) => string
  readonly collected: () => ReadonlyArray<CollectedLink>
}

export const makeLinkCollector = (): LinkCollector => {
  const entries: Array<CollectedLink> = []
  const register = (link: AssistantLink, isLazy: boolean) => {
    const key = destinationKey(link)
    const existing = entries.find((entry) => entry.key === key)
    if (existing !== undefined) {
      // A default link must stay offered even when a sample row registered the same place first.
      if (!isLazy) existing.isLazy = false
      return existing.id
    }
    const id = `L${entries.length + 1}`
    entries.push({ id, link, key, isLazy })
    return id
  }
  return {
    add: (link) => register(link, false),
    addLazy: (link) => register(link, true),
    collected: () => entries,
  }
}

// The model never writes URLs: it names the links it wants by id and the server attaches them, in
// the order named and at most three. When it names none, the default (non-lazy) collected links
// are offered. Links are deduplicated by destination, and only those `isAllowed` accepts are kept.
export const resolveLinks = (
  linkIds: ReadonlyArray<string>,
  collector: LinkCollector,
  isAllowed: (link: AssistantLink) => boolean = () => true,
) => {
  const entries = collector.collected().filter(({ link }) => isAllowed(link))
  const referenced = linkIds.flatMap((id) => entries.filter((entry) => entry.id === id))
  const chosen = referenced.length > 0 ? referenced : entries.filter((entry) => !entry.isLazy)
  const seen = new Set<string>()
  const links = chosen.flatMap(({ link }) => {
    const key = destinationKey(link)
    if (seen.has(key)) return []
    seen.add(key)
    return [link]
  })
  return links.slice(0, maxReplyLinks)
}
