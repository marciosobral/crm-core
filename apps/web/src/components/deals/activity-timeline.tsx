import { type DealActivity, describeDealActivity } from "@crm/contract"
import { DateTime } from "effect"
import { Activity, MessageSquare } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "#src/lib/cn.ts"
import { formatRelative } from "#src/lib/format.ts"
import { CommentComposer } from "./comment-composer.tsx"

function TimelineItem({ activity }: { activity: DealActivity }) {
  const isComment = activity.kind === "COMMENT"
  const Icon = isComment ? MessageSquare : Activity

  return (
    <li className="flex gap-4">
      <span
        aria-hidden="true"
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full border text-white",
          isComment ? "border-line bg-surface-raised" : "border-brand bg-brand/10",
        )}
      >
        <Icon className="size-4" />
      </span>
      <article className="min-w-0 flex-1 space-y-2 rounded-lg border border-line bg-surface-raised p-4">
        <header className="flex items-center justify-between gap-3 leading-[18px]">
          <p className="flex min-w-0 items-baseline gap-1.5">
            <span className="truncate text-[13px] font-bold text-white">
              {activity.author.name}
            </span>
            {!isComment && (
              <span className="font-mono-brand text-[10px] text-warning">SISTEMA</span>
            )}
          </p>
          <time
            dateTime={DateTime.formatIso(activity.createdAt)}
            className="shrink-0 text-xs text-placeholder"
          >
            {formatRelative(activity.createdAt, "long")}
          </time>
        </header>
        <p
          className={cn(
            "text-[13px] leading-[18px] wrap-anywhere whitespace-pre-line",
            isComment ? "text-muted" : "text-white",
          )}
        >
          {describeDealActivity(activity)}
        </p>
      </article>
    </li>
  )
}

type ActivityTimelineProps = {
  dealId: string
  activities: ReadonlyArray<DealActivity> | undefined
  isError: boolean
  shouldFocusComposer?: boolean | undefined
  onComposerFocused?: (() => void) | undefined
}

export function ActivityTimeline({
  dealId,
  activities,
  isError,
  shouldFocusComposer,
  onComposerFocused,
}: ActivityTimelineProps) {
  let timeline: ReactNode
  if (isError)
    timeline = (
      <p role="alert" className="text-sm text-red-400">
        Não foi possível carregar as atividades.
      </p>
    )
  else if (!activities) timeline = <p className="text-sm text-muted">Carregando...</p>
  else if (activities.length === 0)
    timeline = <p className="text-sm text-muted">Nenhuma atividade ainda.</p>
  else
    timeline = (
      <ol className="space-y-4">
        {activities.map((activity) => (
          <TimelineItem key={activity.id} activity={activity} />
        ))}
      </ol>
    )

  return (
    <section
      aria-labelledby="activity-timeline-title"
      className="flex flex-col gap-5 rounded-xl border border-line bg-surface p-5 md:p-6 lg:min-h-0"
    >
      <h2 id="activity-timeline-title" className="font-heading text-base font-bold text-white">
        Linha do Tempo de Atividades
      </h2>
      <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">{timeline}</div>
      <CommentComposer
        dealId={dealId}
        variant="page"
        placeholder="Escreva um comentário ou atualize as tratativas..."
        shouldFocus={shouldFocusComposer}
        onFocused={onComposerFocused}
      />
    </section>
  )
}
