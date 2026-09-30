import { OpenDealStatus } from "@crm/contract"
import { ArrowRightLeft } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"
import { dealStatusLabels } from "../../lib/labels.ts"
import { useAnchoredPopover } from "../../lib/use-anchored-popover.ts"

type MoveMenuProps = {
  dealTitle: string
  currentStatus: OpenDealStatus
  shouldFocusButton: boolean
  onButtonFocused: () => void
  onMove: (status: OpenDealStatus) => void
}

export function MoveMenu({
  dealTitle,
  currentStatus,
  shouldFocusButton,
  onButtonFocused,
  onMove,
}: MoveMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const wrapperRef = useRef<HTMLSpanElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const listId = useId()

  useEffect(() => {
    if (!shouldFocusButton) return
    buttonRef.current?.focus()
    onButtonFocused()
  }, [shouldFocusButton, onButtonFocused])

  useAnchoredPopover({
    isOpen,
    anchorRef: buttonRef,
    containerRef: wrapperRef,
    popoverRef: listRef,
    align: "end",
    onClose: () => setIsOpen(false),
  })

  useEffect(() => {
    if (!isOpen) return
    const getItems = () => Array.from(listRef.current?.querySelectorAll("button") ?? [])
    getItems()[0]?.focus({ preventScroll: true })
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        setIsOpen(false)
        buttonRef.current?.focus()
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault()
        const items = getItems()
        const index = items.findIndex((item) => item === document.activeElement)
        const step = event.key === "ArrowDown" ? 1 : -1
        items.at((index + step + items.length) % items.length)?.focus()
      }
    }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [isOpen])

  return (
    <span ref={wrapperRef} className="flex">
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Mover ${dealTitle} para`}
        aria-expanded={isOpen}
        aria-controls={listId}
        onClick={() => setIsOpen((current) => !current)}
        className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-line hover:text-white focus-visible:outline-2 focus-visible:outline-brand"
      >
        <ArrowRightLeft aria-hidden="true" className="size-3.5" />
      </button>
      <ul
        ref={listRef}
        id={listId}
        popover="manual"
        className="fixed inset-auto m-0 w-44 rounded-md border border-line bg-surface-raised px-0 py-1 text-white shadow-lg"
      >
        {OpenDealStatus.literals
          .filter((status) => status !== currentStatus)
          .map((status) => (
            <li key={status}>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false)
                  onMove(status)
                }}
                className="w-full cursor-pointer px-3 py-1.5 text-left text-sm text-white hover:bg-line focus-visible:bg-line focus-visible:outline-none"
              >
                {dealStatusLabels[status]}
              </button>
            </li>
          ))}
      </ul>
    </span>
  )
}
