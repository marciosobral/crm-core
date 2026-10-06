import { commentMaxLength } from "@crm/contract"
import { ArrowRight, ArrowUpRight } from "lucide-react"
import { type KeyboardEvent, useId, useState } from "react"
import { cn } from "#src/lib/cn.ts"
import { useAddComment } from "#src/lib/use-add-comment.ts"

const counterThreshold = commentMaxLength - 200

type CommentComposerProps = {
  dealId: string
  variant: "panel" | "page"
  placeholder: string
  shouldFocus?: boolean | undefined
  onFocused?: (() => void) | undefined
}

export function CommentComposer({
  dealId,
  variant,
  placeholder,
  shouldFocus = false,
  onFocused,
}: CommentComposerProps) {
  const [body, setBody] = useState("")
  const [announcement, setAnnouncement] = useState("")
  const addComment = useAddComment(dealId)
  const errorId = useId()
  const trimmedBody = body.trim()
  const canSend = trimmedBody !== "" && !addComment.isPending

  const send = () => {
    if (!canSend) return
    setAnnouncement("")
    addComment.mutate(trimmedBody, {
      onSuccess: () => {
        setBody("")
        setAnnouncement("Comentário adicionado.")
      },
    })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    send()
  }

  return (
    <form
      className="relative flex flex-col gap-1.5"
      onSubmit={(event) => {
        event.preventDefault()
        send()
      }}
    >
      <div
        className={cn(
          "flex items-end border border-line bg-canvas focus-within:border-brand",
          variant === "page" ? "gap-3 rounded-lg p-3" : "gap-2 rounded-md px-3 py-2.5",
        )}
      >
        <textarea
          ref={(element) => {
            if (!shouldFocus || !element) return
            element.focus()
            onFocused?.()
          }}
          aria-label="Comentário"
          rows={1}
          maxLength={commentMaxLength}
          value={body}
          placeholder={placeholder}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={onKeyDown}
          aria-invalid={addComment.isError ? true : undefined}
          aria-describedby={addComment.isError ? errorId : undefined}
          className={cn(
            "max-h-24 flex-1 resize-none bg-transparent leading-5 text-white field-sizing-content placeholder:text-placeholder focus:outline-none",
            variant === "page" ? "py-1.5 text-sm" : "py-1 text-xs",
          )}
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label="Enviar comentário"
          className={cn(
            "flex shrink-0 items-center justify-center bg-brand text-white hover:bg-brand-hover disabled:opacity-70",
            variant === "page" ? "size-[30px] rounded-md" : "size-6 rounded",
          )}
        >
          {variant === "page" ? (
            <ArrowRight className="size-3.5" aria-hidden="true" />
          ) : (
            <ArrowUpRight className="size-3" aria-hidden="true" />
          )}
        </button>
      </div>
      {body.length >= counterThreshold && (
        <p className="text-right text-xs text-muted">
          {body.length}/{commentMaxLength}
        </p>
      )}
      {addComment.isError && (
        <p id={errorId} role="alert" className="text-xs text-red-400">
          Não foi possível enviar o comentário. Tente novamente.
        </p>
      )}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </form>
  )
}
