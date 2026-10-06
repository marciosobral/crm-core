import type { AssistantConversationSummary } from "@crm/contract"
import type { ReactNode } from "react"
import { cn } from "#src/lib/cn.ts"
import { formatRelative } from "#src/lib/format.ts"

type AssistantHistoryListProps = {
  conversations: ReadonlyArray<AssistantConversationSummary> | undefined
  isError: boolean
  selectedId: string | undefined
  isDisabled: boolean
  onSelect: (conversationId: string) => void
}

export function AssistantHistoryList({
  conversations,
  isError,
  selectedId,
  isDisabled,
  onSelect,
}: AssistantHistoryListProps) {
  let content: ReactNode
  if (isError)
    content = (
      <p role="alert" className="text-sm text-red-400">
        Não foi possível carregar as conversas.
      </p>
    )
  else if (!conversations) content = <p className="text-sm text-muted">Carregando...</p>
  else if (conversations.length === 0)
    content = <p className="text-sm text-muted">Nenhuma conversa ainda.</p>
  else
    content = (
      <>
        <h3 className="pb-2 text-xs font-semibold text-muted">Conversas recentes</h3>
        <ul className="space-y-2">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <button
                type="button"
                disabled={isDisabled}
                className={cn(
                  "flex w-full min-w-0 flex-col gap-0.5 rounded-md border border-line px-3 py-2 text-left hover:bg-line focus-visible:outline-2 focus-visible:outline-brand",
                  conversation.id === selectedId && "border-brand bg-brand/10",
                )}
                aria-current={conversation.id === selectedId ? "true" : undefined}
                onClick={() => onSelect(conversation.id)}
              >
                <span className="truncate text-sm font-medium text-white">
                  {conversation.title}
                </span>
                <span className="text-xs text-muted">
                  {formatRelative(conversation.updatedAt, "short")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </>
    )

  return <div className="min-h-0 flex-1 overflow-y-auto py-4 pl-5 pr-4">{content}</div>
}
