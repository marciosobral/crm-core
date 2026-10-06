import type { DealActivity, DealComment } from "@crm/contract"
import { DateTime } from "effect"
import { MessageCircle } from "lucide-react"
import type { ReactNode } from "react"
import { formatRelative, initialsOf } from "#src/lib/format.ts"
import { CommentComposer } from "./comment-composer.tsx"

type PanelCommentsProps = {
  dealId: string
  activities: ReadonlyArray<DealActivity> | undefined
  isError: boolean
  shouldFocusComposer?: boolean | undefined
  onComposerFocused?: (() => void) | undefined
}

export function PanelComments({
  dealId,
  activities,
  isError,
  shouldFocusComposer,
  onComposerFocused,
}: PanelCommentsProps) {
  const comments = activities?.filter(
    (activity): activity is DealComment => activity.kind === "COMMENT",
  )

  let content: ReactNode
  if (isError)
    content = (
      <p role="alert" className="text-xs text-red-400">
        Não foi possível carregar os comentários.
      </p>
    )
  else if (!comments) content = <p className="text-xs text-muted">Carregando...</p>
  else if (comments.length === 0)
    content = <p className="text-xs text-muted">Nenhum comentário ainda.</p>
  else
    content = (
      <ol className="space-y-2">
        {comments.map((comment) => (
          <li key={comment.id} className="space-y-1.5 rounded-md border border-line bg-surface p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="flex min-w-0 items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="flex size-4 shrink-0 items-center justify-center rounded-full bg-brand text-[7px] font-bold text-white"
                >
                  {initialsOf(comment.author.name)}
                </span>
                <span className="truncate text-xs font-bold text-white">{comment.author.name}</span>
              </p>
              <time
                dateTime={DateTime.formatIso(comment.createdAt)}
                className="shrink-0 text-xs text-placeholder"
              >
                {formatRelative(comment.createdAt, "short")}
              </time>
            </div>
            <p className="text-xs leading-[17px] break-words whitespace-pre-line text-muted">
              {comment.body}
            </p>
          </li>
        ))}
      </ol>
    )

  return (
    <section aria-labelledby="panel-comments-title" className="space-y-3 border-t border-line pt-6">
      <h3
        id="panel-comments-title"
        className="flex items-center gap-2 font-heading text-sm font-bold text-white"
      >
        <MessageCircle className="size-3.5 text-muted" aria-hidden="true" />
        Comentários
      </h3>
      {content}
      <CommentComposer
        dealId={dealId}
        variant="panel"
        placeholder="Escreva um comentário..."
        shouldFocus={shouldFocusComposer}
        onFocused={onComposerFocused}
      />
    </section>
  )
}
