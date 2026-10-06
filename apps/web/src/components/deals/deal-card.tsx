import { draggable } from "@atlaskit/pragmatic-drag-and-drop/element/adapter"
import { type Deal, OpenDealStatus } from "@crm/contract"
import { Link } from "@tanstack/react-router"
import { Option, Schema } from "effect"
import { useEffect, useRef, useState } from "react"
import { cn } from "#src/lib/cn.ts"
import { formatDealValue } from "#src/lib/currency.ts"
import { initialsOf } from "#src/lib/initials.ts"
import { dealStatusTextClasses } from "#src/lib/labels.ts"
import { MoveMenu } from "./move-menu.tsx"

type DealCardProps = {
  deal: Deal
  canMove: boolean
  canClose: boolean
  canComment: boolean
  isSelected: boolean
  onOpen: () => void
  shouldFocusMoveButton: boolean
  onMoveButtonFocused: () => void
  onMove: (status: OpenDealStatus) => void
  onCloseRequest: (mode: "WON" | "LOST") => void
  onCommentRequest: () => void
}

export function DealCard({
  deal,
  canMove,
  canClose,
  canComment,
  isSelected,
  onOpen,
  shouldFocusMoveButton,
  onMoveButtonFocused,
  onMove,
  onCloseRequest,
  onCommentRequest,
}: DealCardProps) {
  const ref = useRef<HTMLElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const openStatus = Schema.decodeUnknownOption(OpenDealStatus)(deal.status)
  const isMovable = canMove && Option.isSome(openStatus)
  const hasMenu = isMovable || canComment

  useEffect(() => {
    const element = ref.current
    if (!element || !isMovable) return
    return draggable({
      element,
      getInitialData: () => ({ dealId: deal.id, status: deal.status }),
      onDragStart: () => setIsDragging(true),
      onDrop: () => setIsDragging(false),
    })
  }, [deal.id, deal.status, isMovable])

  return (
    <article
      ref={ref}
      className={cn(
        "relative space-y-2.5 rounded-lg border bg-surface p-3.5",
        isSelected ? "border-brand" : "border-line",
        isMovable && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 truncate text-sm font-bold text-white" title={deal.title}>
          <Link
            to="/deals/$dealId"
            params={{ dealId: deal.id }}
            draggable={false}
            ref={(link) => {
              // A card without the actions menu has no button, so its title link is the only element that can take the focus request.
              if (!shouldFocusMoveButton || hasMenu || !link) return
              link.focus()
              onMoveButtonFocused()
            }}
            className="after:absolute after:inset-0"
            onClick={(event) => {
              // From lg up the details open in the board's side panel instead of navigating to the page.
              if (!window.matchMedia("(min-width: 1024px)").matches) return
              event.preventDefault()
              onOpen()
            }}
          >
            {deal.title}
          </Link>
        </h3>
        {deal.status === "WON" && (
          <span className="shrink-0 text-xs font-semibold text-status-won">Ganho</span>
        )}
        {deal.status === "LOST" && (
          <span className="shrink-0 text-xs font-semibold text-status-lost">Perdido</span>
        )}
      </div>
      <p
        className={cn(
          "truncate font-heading text-lg leading-none font-extrabold",
          dealStatusTextClasses[deal.status],
        )}
      >
        {formatDealValue(deal.valueCents)}
      </p>
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-xs text-muted">{deal.lead.name}</span>
        <span className="relative z-10 flex shrink-0 items-center gap-1">
          {hasMenu && (
            <MoveMenu
              dealId={deal.id}
              dealTitle={deal.title}
              currentStatus={isMovable && Option.isSome(openStatus) ? openStatus.value : undefined}
              canClose={canClose}
              canComment={canComment}
              shouldFocusButton={shouldFocusMoveButton}
              onButtonFocused={onMoveButtonFocused}
              onMove={onMove}
              onCloseRequest={onCloseRequest}
              onCommentRequest={onCommentRequest}
            />
          )}
          <span
            title={deal.seller.name}
            className="flex size-6 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white"
          >
            <span aria-hidden="true">{initialsOf(deal.seller.name)}</span>
            <span className="sr-only">Vendedor: {deal.seller.name}</span>
          </span>
        </span>
      </div>
    </article>
  )
}
