import {
  type AssistantLink,
  AssistantPageContext,
  AssistantRateLimited,
  type AssistantScreen,
  type AssistantToolName,
  AssistantUnavailable,
  type DataToolName,
  isDataTool,
  ListLeadsQuery,
} from "@crm/contract"
import { queryOptions } from "@tanstack/react-query"
import type { useNavigate } from "@tanstack/react-router"
import { Option, Schema } from "effect"
import { runApi } from "./api-client.ts"
import { filtersFromSearch, searchFromFilters } from "./deals.ts"

export const assistantQueryKey = "assistant"

export const conversationsQueryOptions = queryOptions({
  queryKey: [assistantQueryKey, "conversations"],
  queryFn: () => runApi((client) => client.assistant.listConversations()),
})

export const conversationQueryOptions = (id: string) =>
  queryOptions({
    queryKey: [assistantQueryKey, "conversation", id],
    queryFn: () => runApi((client) => client.assistant.getConversation({ params: { id } })),
    retry: false,
  })

export const suggestionsQueryOptions = queryOptions({
  queryKey: [assistantQueryKey, "suggestions"],
  queryFn: () => runApi((client) => client.assistant.suggestions()),
  staleTime: 60_000,
})

export const assistantErrorMessage = (error: Error) => {
  if (error instanceof AssistantRateLimited)
    return `Muitas mensagens em pouco tempo. Tente novamente em ${error.retryAfterSeconds} s.`
  if (error instanceof AssistantUnavailable)
    return "Assistente indisponível no momento. Tente novamente mais tarde."
  return "Não foi possível responder. Tente novamente."
}

const toolLabels: Record<DataToolName, string> = {
  searchDeals: "negócios",
  summarizeSales: "vendas",
  searchLeads: "leads",
  listSellers: "vendedores",
  getDealTimeline: "histórico do negócio",
  rankSellers: "ranking de vendedores",
}

// openScreen is not a data tool: it only produces a link button, so it is not worth mentioning.
export const toolsUsedLabel = (toolsUsed: ReadonlyArray<AssistantToolName>) => {
  const labels = new Set(toolsUsed.filter(isDataTool).map((tool) => toolLabels[tool]))
  return labels.size === 0 ? undefined : `Consultei: ${[...labels].join(", ")}`
}

const conversationStorageKey = "assistant.conversationId"

export const readStoredConversationId = () => {
  try {
    return localStorage.getItem(conversationStorageKey) ?? undefined
  } catch {
    return undefined
  }
}

export const storeConversationId = (id: string | undefined) => {
  try {
    if (id) localStorage.setItem(conversationStorageKey, id)
    else localStorage.removeItem(conversationStorageKey)
  } catch {
    // Storage can be blocked; the conversation just is not remembered after a reload.
  }
}

const decodePageContext = Schema.decodeUnknownOption(AssistantPageContext)
const decodeLeadQuery = Schema.decodeUnknownOption(ListLeadsQuery)

// What the assistant is told about the screen: the deal being viewed (the board's side panel
// counts) or the filters applied to the board or the leads list, read from the location.
export const pageContextFrom = (pathname: string, searchStr: string): AssistantPageContext => {
  const path = pathname.replace(/\/$/, "")
  const search = Object.fromEntries(new URLSearchParams(searchStr))
  const other: AssistantPageContext = { page: "OTHER" }
  const orOther = (context: unknown) => Option.getOrElse(decodePageContext(context), () => other)
  if (path === "/deals") {
    const dealId = search.dealId
    if (dealId !== undefined) return orOther({ page: "DEAL", dealId })
    const filters = filtersFromSearch(search)
    const hasFilters = Object.keys(filters).length > 0
    return orOther(hasFilters ? { page: "DEALS_BOARD", filters } : { page: "DEALS_BOARD" })
  }
  if (path === "/deals/new") return { page: "DEAL_NEW" }
  const dealPath = /^\/deals\/([^/]+)$/.exec(path)
  if (dealPath !== null) return orOther({ page: "DEAL", dealId: dealPath[1] })
  if (path === "/leads/new") return { page: "LEAD_NEW" }
  if (path === "/leads") {
    const filters = Option.getOrElse(decodeLeadQuery(search), () => ({}))
    const hasFilters = Object.keys(filters).length > 0
    return orOther(hasFilters ? { page: "LEADS", filters } : { page: "LEADS" })
  }
  return other
}

// The deal side panel only exists on the board, where the deal is a search parameter.
export const isDealPanelOpen = (pathname: string, searchStr: string) =>
  pathname.replace(/\/$/, "") === "/deals" && pageContextFrom(pathname, searchStr).page === "DEAL"

const screenRoutes = {
  NEW_LEAD: "/leads/new",
  NEW_DEAL: "/deals/new",
  LEADS: "/leads",
  DEALS: "/deals",
} as const satisfies Record<AssistantScreen, string>

type Navigate = ReturnType<typeof useNavigate>

export const openAssistantLink = (navigate: Navigate, link: AssistantLink, isDesktop: boolean) => {
  switch (link.kind) {
    case "VIEW_DEALS":
      return navigate({ to: "/deals", search: searchFromFilters(link.filters) })
    case "VIEW_LEADS":
      return navigate({ to: "/leads", search: Schema.encodeSync(ListLeadsQuery)(link.filters) })
    case "OPEN_DEAL":
      // The side panel only exists from lg up; below it the deal has its own page.
      return isDesktop
        ? navigate({ to: "/deals", search: { dealId: link.dealId } })
        : navigate({ to: "/deals/$dealId", params: { dealId: link.dealId } })
    case "OPEN_SCREEN":
      return navigate({ to: screenRoutes[link.screen] })
  }
}
