import type { AssistantLink, AssistantMessage } from "@crm/contract"
import { ArrowUpRight } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "#src/lib/cn.ts"
import { AssistantText } from "./assistant-text.tsx"

type AssistantThreadProps = {
  messages: ReadonlyArray<AssistantMessage>
  pendingMessage: string | undefined
  toolsUsedLabel: string | undefined
  onOpenLink: (link: AssistantLink) => void
}

// A stable callback ref: it only runs when the keyed sentinel below mounts, not on every render.
const scrollIntoView = (element: HTMLDivElement | null) => element?.scrollIntoView({ block: "end" })

function Bubble({ isUser, children }: { isUser: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        "max-w-[85%] rounded-xl px-3 py-2 text-sm leading-5 break-words",
        isUser && "whitespace-pre-wrap",
        isUser
          ? "self-end rounded-br-sm bg-brand text-white"
          : "self-start rounded-bl-sm bg-surface-raised text-zinc-100",
      )}
    >
      {children}
    </div>
  )
}

export function AssistantThread({
  messages,
  pendingMessage,
  toolsUsedLabel,
  onOpenLink,
}: AssistantThreadProps) {
  const lastMessageId = messages.at(-1)?.id

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto py-4 pl-5 pr-4">
      {messages.map((message) => {
        const isUser = message.role === "USER"
        return (
          <div key={message.id} className={cn("flex flex-col gap-2", isUser && "items-end")}>
            <Bubble isUser={isUser}>
              {isUser ? message.content : <AssistantText content={message.content} />}
            </Bubble>
            {message.links.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {message.links.map((link) => (
                  <button
                    key={JSON.stringify(link)}
                    type="button"
                    onClick={() => onOpenLink(link)}
                    className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-zinc-100 hover:bg-line focus-visible:outline-2 focus-visible:outline-brand"
                  >
                    {link.label}
                    <ArrowUpRight className="size-3.5" aria-hidden="true" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
      {pendingMessage !== undefined && (
        <>
          <Bubble isUser>{pendingMessage}</Bubble>
          <Bubble isUser={false}>
            <span className="sr-only">Pensando...</span>
            <span aria-hidden="true" className="flex items-center gap-1 py-1">
              {[0, 1, 2].map((dot) => (
                <span
                  key={dot}
                  className="size-1.5 animate-bounce rounded-full bg-muted motion-reduce:animate-none"
                  style={{ animationDelay: `${dot * 150}ms` }}
                />
              ))}
            </span>
          </Bubble>
        </>
      )}
      {pendingMessage === undefined && toolsUsedLabel && (
        <p className="text-xs text-muted">{toolsUsedLabel}</p>
      )}
      <div key={`${lastMessageId}-${pendingMessage}`} ref={scrollIntoView} />
    </div>
  )
}
