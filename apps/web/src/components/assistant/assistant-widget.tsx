import { type AssistantLink, hasPermission } from "@crm/contract"
import { useQuery, useSuspenseQuery } from "@tanstack/react-query"
import { useNavigate, useRouterState } from "@tanstack/react-router"
import { HttpApiError } from "effect/unstable/httpapi"
import { History, Sparkles, SquarePen, X } from "lucide-react"
import { type KeyboardEvent, useEffect, useRef, useState } from "react"
import { Button } from "#src/components/ui/button.tsx"
import {
  assistantErrorMessage,
  conversationQueryOptions,
  conversationsQueryOptions,
  isDealPanelOpen,
  openAssistantLink,
  readStoredConversationId,
  storeConversationId,
  suggestionsQueryOptions,
  toolsUsedLabel,
} from "#src/lib/assistant.ts"
import { meQueryOptions } from "#src/lib/auth.ts"
import { cn } from "#src/lib/cn.ts"
import { useIsDesktop } from "#src/lib/media.ts"
import { useSendAssistantMessage } from "#src/lib/use-send-assistant-message.ts"
import { AssistantComposer } from "./assistant-composer.tsx"
import { AssistantEmptyState } from "./assistant-empty-state.tsx"
import { AssistantHistoryList } from "./assistant-history-list.tsx"
import { AssistantThread } from "./assistant-thread.tsx"

// The deal panel (360 px) only exists from lg up, so the widget only shifts there.
const panelOffsetClasses = "lg:right-[calc(360px+var(--assistant-pill-offset))]"

// `isPillInert` keeps the closed pill out of the tab order while the mobile nav drawer is open.
type AssistantWidgetProps = { onSheetChange: (isSheetOpen: boolean) => void; isPillInert: boolean }

export function AssistantWidget({ onSheetChange, isPillInert }: AssistantWidgetProps) {
  const { data: user } = useSuspenseQuery(meQueryOptions)
  if (!hasPermission(user, "assistant.chat")) return null
  return <Assistant onSheetChange={onSheetChange} isPillInert={isPillInert} />
}

function Assistant({ onSheetChange, isPillInert }: AssistantWidgetProps) {
  const navigate = useNavigate()
  const isPanelOpen = useRouterState({
    select: ({ location }) => isDealPanelOpen(location.pathname, location.searchStr),
  })
  const [isOpen, setIsOpen] = useState(false)
  // Below lg the open chat is a full-height sheet that covers the page; from lg up it is a floating card.
  const isDesktop = useIsDesktop()
  const isSheet = isOpen && !isDesktop
  const [view, setView] = useState<"chat" | "history">("chat")
  const [conversationId, setConversationId] = useState(readStoredConversationId)
  const [draft, setDraft] = useState("")
  const pillRef = useRef<HTMLButtonElement>(null)
  const wasOpenRef = useRef(false)

  const {
    mutation: sendMutation,
    unsavedMessages,
    toolsUsed,
    announcement,
    clearResults,
  } = useSendAssistantMessage({
    conversationId,
    onStart: () => setDraft(""),
    onFailure: (message) => setDraft((current) => (current === "" ? message : current)),
    onConversationSaved: (savedConversationId) => {
      setConversationId(savedConversationId)
      storeConversationId(savedConversationId)
    },
  })

  const conversationQuery = useQuery({
    ...conversationQueryOptions(conversationId ?? ""),
    enabled: isOpen && conversationId !== undefined,
  })
  const messages = [...(conversationQuery.data?.messages ?? []), ...unsavedMessages]
  const isEmpty = messages.length === 0
  const suggestionsQuery = useQuery({
    ...suggestionsQueryOptions,
    enabled: isOpen && view === "chat" && isEmpty,
  })
  const conversationsQuery = useQuery({
    ...conversationsQueryOptions,
    enabled: isOpen && view === "history",
  })

  const selectConversation = (id: string | undefined) => {
    setConversationId(id)
    storeConversationId(id)
    clearResults()
  }

  // A remembered conversation can be gone (or belong to a previous account on this browser).
  useEffect(() => {
    if (conversationQuery.error instanceof HttpApiError.NotFound) {
      setConversationId(undefined)
      storeConversationId(undefined)
    }
  }, [conversationQuery.error])

  useEffect(() => {
    onSheetChange(isSheet)
    return () => onSheetChange(false)
  }, [isSheet, onSheetChange])

  // The pill is unmounted while the card is open, so focus returns to it after the card closes.
  useEffect(() => {
    if (!isOpen && wasOpenRef.current) pillRef.current?.focus()
    wasOpenRef.current = isOpen
  }, [isOpen])

  const openLink = (link: AssistantLink) => {
    if (!isDesktop) setIsOpen(false)
    void openAssistantLink(navigate, link, isDesktop)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") setIsOpen(false)
  }

  if (!isOpen) {
    return (
      <button
        ref={pillRef}
        type="button"
        inert={isPillInert}
        onClick={() => setIsOpen(true)}
        className={cn(
          "fixed right-(--assistant-pill-offset) bottom-(--assistant-pill-offset) z-20 flex size-(--assistant-pill-size) items-center justify-center gap-2 rounded-full bg-brand text-sm font-bold text-white shadow-lg hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand md:w-auto md:px-5",
          isPanelOpen && panelOffsetClasses,
        )}
      >
        <Sparkles className="size-4" aria-hidden="true" />
        <span className="sr-only md:not-sr-only">Perguntar</span>
      </button>
    )
  }

  const startNewConversation = () => {
    selectConversation(undefined)
    setDraft("")
    sendMutation.reset()
    setView("chat")
  }
  const openConversation = (id: string) => {
    selectConversation(id)
    setView("chat")
  }
  const hasConversationLoadError =
    conversationQuery.isError && !(conversationQuery.error instanceof HttpApiError.NotFound)
  const conversationBody =
    isEmpty && !sendMutation.isPending ? (
      <AssistantEmptyState
        suggestions={suggestionsQuery.data ?? []}
        onSuggestion={(suggestion) => sendMutation.mutate(suggestion)}
      />
    ) : (
      <AssistantThread
        messages={messages}
        pendingMessage={sendMutation.isPending ? sendMutation.variables : undefined}
        toolsUsedLabel={toolsUsedLabel(toolsUsed)}
        onOpenLink={openLink}
      />
    )

  return (
    <section
      role="dialog"
      aria-labelledby="assistant-title"
      aria-modal={isSheet ? true : undefined}
      onKeyDown={onKeyDown}
      className={cn(
        "fixed inset-0 z-50 flex flex-col bg-surface lg:inset-auto lg:right-6 lg:bottom-6 lg:h-[600px] lg:max-h-[calc(100dvh-3rem)] lg:w-[400px] lg:rounded-xl lg:border lg:border-line lg:shadow-2xl",
        isPanelOpen && panelOffsetClasses,
      )}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-line py-4 pl-5 pr-4">
        <h2 id="assistant-title" className="flex-1 font-heading text-base font-bold text-white">
          Assistente
        </h2>
        <Button
          variant="icon"
          aria-label="Nova conversa"
          disabled={sendMutation.isPending}
          title="Nova conversa"
          onClick={startNewConversation}
        >
          <SquarePen className="size-4" aria-hidden="true" />
        </Button>
        <Button
          variant="icon"
          className={cn(view === "history" && "bg-line text-zinc-100")}
          aria-label="Conversas"
          title="Conversas"
          aria-pressed={view === "history"}
          onClick={() => setView((current) => (current === "history" ? "chat" : "history"))}
        >
          <History className="size-4" aria-hidden="true" />
        </Button>
        <Button variant="icon" aria-label="Fechar assistente" onClick={() => setIsOpen(false)}>
          <X className="size-4" aria-hidden="true" />
        </Button>
      </header>

      {view === "history" ? (
        <AssistantHistoryList
          conversations={conversationsQuery.data}
          isError={conversationsQuery.isError}
          selectedId={conversationId}
          isDisabled={sendMutation.isPending}
          onSelect={openConversation}
        />
      ) : (
        <>
          {conversationBody}
          {hasConversationLoadError && (
            <p role="alert" className="pb-2 pl-5 pr-4 text-xs text-red-400">
              Não foi possível carregar a conversa.
            </p>
          )}
          {sendMutation.isError && (
            <p role="alert" className="pb-2 pl-5 pr-4 text-xs text-red-400">
              {assistantErrorMessage(sendMutation.error)}
            </p>
          )}
          <AssistantComposer
            draft={draft}
            isSending={sendMutation.isPending}
            onDraftChange={setDraft}
            onSend={(message) => sendMutation.mutate(message)}
          />
        </>
      )}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </section>
  )
}
