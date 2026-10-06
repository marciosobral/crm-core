import { dealStatusLabels, OpenDealStatus } from "@crm/contract"
import { Link } from "@tanstack/react-router"
import { ArrowRightLeft } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"
import { cn } from "#src/lib/cn.ts"
import { useAnchoredPopover } from "#src/lib/use-anchored-popover.ts"

const menuItemClasses =
  "w-full px-3 py-1.5 text-left text-sm text-white hover:bg-line focus-visible:bg-line focus-visible:outline-none"

type MoveMenuProps = {
  dealId: string
  dealTitle: string
  currentStatus: OpenDealStatus | undefined
  canClose: boolean
  canComment: boolean
  shouldFocusButton: boolean
  onButtonFocused: () => void
  onMove: (status: OpenDealStatus) => void
  onCloseRequest: (mode: "WON" | "LOST") => void
  onCommentRequest: () => void
}

export function MoveMenu({
  dealId,
  dealTitle,
  currentStatus,
  canClose,
  canComment,
  shouldFocusButton,
  onButtonFocused,
  onMove,
  onCloseRequest,
  onCommentRequest,
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

  // Declared after useAnchoredPopover so the list is already shown when its first item takes focus.
  useEffect(() => {
    if (!isOpen) return
    const getItems = () =>
      Array.from(listRef.current?.querySelectorAll<HTMLElement>("button, a") ?? [])
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
        aria-label={`Ações do negócio ${dealTitle}`}
        aria-expanded={isOpen}
        aria-controls={listId}
        onClick={() => setIsOpen((current) => !current)}
        className="flex size-7 items-center justify-center rounded-md text-muted hover:bg-line hover:text-white focus-visible:outline-2 focus-visible:outline-brand"
      >
        <ArrowRightLeft aria-hidden="true" className="size-3.5" />
      </button>
      <ul
        ref={listRef}
        id={listId}
        popover="manual"
        className="fixed inset-auto m-0 w-44 overflow-hidden rounded-md border border-line bg-surface-raised p-0 text-white shadow-lg"
      >
        <li>
          <Link
            to="/deals/$dealId"
            params={{ dealId }}
            onClick={() => setIsOpen(false)}
            className={cn("block", menuItemClasses)}
          >
            Ver detalhes
          </Link>
        </li>
        {canComment && (
          <li>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false)
                onCommentRequest()
              }}
              className={menuItemClasses}
            >
              Comentar
            </button>
          </li>
        )}
        {currentStatus !== undefined && (
          <>
            <li>
              <hr className="my-1 border-line" />
            </li>
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
                    className={menuItemClasses}
                  >
                    {dealStatusLabels[status]}
                  </button>
                </li>
              ))}
            {canClose && (
              <>
                <li>
                  <hr className="my-1 border-line" />
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false)
                      onCloseRequest("WON")
                    }}
                    className={cn(menuItemClasses, "text-status-won")}
                  >
                    Marcar como ganho
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false)
                      onCloseRequest("LOST")
                    }}
                    className={cn(menuItemClasses, "text-status-lost")}
                  >
                    Marcar como perdido
                  </button>
                </li>
              </>
            )}
          </>
        )}
      </ul>
    </span>
  )
}
