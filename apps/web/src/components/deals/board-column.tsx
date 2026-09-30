import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter"
import type { Deal, DealStatus, OpenDealStatus } from "@crm/contract"
import { useEffect, useRef, useState } from "react"
import { cn } from "../../lib/cn.ts"
import { dealStatusBadgeClasses, dealStatusDotClasses, dealStatusLabels } from "../../lib/labels.ts"
import type { BoardColumn as BoardColumnConfig } from "./board-columns.ts"
import { DealCard } from "./deal-card.tsx"

export type MoveFocusRequest = { dealId: string; status: DealStatus }

type BoardColumnProps = {
  column: BoardColumnConfig
  deals: ReadonlyArray<Deal>
  canMove: boolean
  selectedDealId: string | undefined
  onOpenDeal: (deal: Deal) => void
  focusRequest: MoveFocusRequest | undefined
  onMoveButtonFocused: () => void
  onMove: (deal: Deal, status: OpenDealStatus) => void
}

export function BoardColumn({
  column,
  deals,
  canMove,
  selectedDealId,
  onOpenDeal,
  focusRequest,
  onMoveButtonFocused,
  onMove,
}: BoardColumnProps) {
  const ref = useRef<HTMLElement>(null)
  const [isOver, setIsOver] = useState(false)
  const { dropStatus } = column

  useEffect(() => {
    const element = ref.current
    if (!element || dropStatus === undefined) return
    return dropTargetForElements({
      element,
      getData: () => ({ status: dropStatus }),
      canDrop: ({ source }) => source.data.status !== dropStatus,
      onDragEnter: () => setIsOver(true),
      onDragLeave: () => setIsOver(false),
      onDrop: () => setIsOver(false),
    })
  }, [dropStatus])

  return (
    <section
      ref={ref}
      aria-labelledby={`column-${column.status}`}
      className="flex w-[272px] shrink-0 snap-start flex-col lg:w-auto lg:min-w-[180px] lg:flex-1"
    >
      <header className="mx-[9px] mb-3 flex items-center justify-between gap-2 border-b border-line pb-3">
        <h2
          id={`column-${column.status}`}
          className="flex items-center gap-2 text-sm font-bold whitespace-nowrap text-white"
        >
          <span
            aria-hidden="true"
            className={cn("size-1.5 rounded-full", dealStatusDotClasses[column.status])}
          />
          {dropStatus === undefined ? "Fechado" : dealStatusLabels[dropStatus]}
        </h2>
        <span
          className={cn(
            "rounded-md px-1.5 py-0.5 text-xs font-medium",
            dealStatusBadgeClasses[column.status],
          )}
        >
          {deals.length}
        </span>
      </header>
      <ul
        className={cn(
          "flex min-h-24 flex-1 flex-col gap-3 overflow-y-auto rounded-xl border border-transparent p-2 transition-colors",
          isOver && "border-brand/40 bg-brand/5",
        )}
      >
        {deals.map((deal) => (
          <li key={deal.id}>
            <DealCard
              deal={deal}
              canMove={canMove}
              isSelected={selectedDealId === deal.id}
              onOpen={() => onOpenDeal(deal)}
              shouldFocusMoveButton={
                focusRequest?.dealId === deal.id && focusRequest.status === deal.status
              }
              onMoveButtonFocused={onMoveButtonFocused}
              onMove={(status) => onMove(deal, status)}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}
