import { assistantMessageMaxLength } from "@crm/contract"
import { ArrowUp } from "lucide-react"
import { type KeyboardEvent, useEffect, useRef } from "react"

type AssistantComposerProps = {
  draft: string
  isSending: boolean
  onDraftChange: (draft: string) => void
  onSend: (message: string) => void
}

export function AssistantComposer({
  draft,
  isSending,
  onDraftChange,
  onSend,
}: AssistantComposerProps) {
  const textAreaRef = useRef<HTMLTextAreaElement>(null)
  const trimmedDraft = draft.trim()
  const canSend = trimmedDraft !== "" && !isSending

  useEffect(() => textAreaRef.current?.focus(), [])

  const send = () => {
    if (canSend) onSend(trimmedDraft)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    send()
  }

  return (
    <form
      className="flex shrink-0 items-end gap-2 border-t border-line py-4 pl-5 pr-4"
      onSubmit={(event) => {
        event.preventDefault()
        send()
      }}
    >
      <textarea
        ref={textAreaRef}
        aria-label="Mensagem"
        rows={1}
        maxLength={assistantMessageMaxLength}
        value={draft}
        placeholder="Pergunte sobre seus leads e negócios"
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={onKeyDown}
        className="max-h-28 min-w-0 flex-1 resize-none rounded-md border border-line bg-canvas px-3 py-2 text-sm leading-5 text-white field-sizing-content placeholder:text-placeholder focus:border-brand focus:outline-none"
      />
      <button
        type="submit"
        disabled={!canSend}
        aria-label="Enviar mensagem"
        className="flex size-9.5 shrink-0 items-center justify-center rounded-md bg-brand text-white hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60"
      >
        <ArrowUp className="size-4" aria-hidden="true" />
      </button>
    </form>
  )
}
