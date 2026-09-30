import { type RefObject, useEffect, useRef } from "react"

type AnchoredPopoverOptions = {
  isOpen: boolean
  anchorRef: RefObject<HTMLElement | null>
  containerRef: RefObject<HTMLElement | null>
  popoverRef: RefObject<HTMLElement | null>
  align: "start" | "end"
  matchAnchorWidth?: boolean
  onClose: () => void
}

const gap = 4

// Shows a `popover="manual"` element in the top layer next to its anchor, so no overflow container
// can clip it, and closes it on outside pointerdown/focus, page scroll and resize.
export function useAnchoredPopover({
  isOpen,
  anchorRef,
  containerRef,
  popoverRef,
  align,
  matchAnchorWidth = false,
  onClose,
}: AnchoredPopoverOptions) {
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    const popover = popoverRef.current
    const anchor = anchorRef.current
    if (!isOpen || !popover || !anchor) return
    popover.showPopover()
    const rect = anchor.getBoundingClientRect()
    if (matchAnchorWidth) popover.style.width = `${rect.width}px`
    const hasRoomBelow = rect.bottom + gap + popover.offsetHeight <= window.innerHeight
    popover.style.top = `${hasRoomBelow ? rect.bottom + gap : Math.max(gap, rect.top - gap - popover.offsetHeight)}px`
    popover.style.left = `${
      align === "end"
        ? Math.max(gap, rect.right - popover.offsetWidth)
        : Math.max(gap, Math.min(rect.left, window.innerWidth - popover.offsetWidth - gap))
    }px`

    const close = () => onCloseRef.current()
    const closeOnOutsideTarget = (event: Event) => {
      if (!(event.target instanceof Node)) return
      const isInside =
        containerRef.current?.contains(event.target) || popover.contains(event.target)
      if (!isInside) close()
    }
    const closeOnOuterScroll = (event: Event) => {
      if (event.target instanceof Node && popover.contains(event.target)) return
      close()
    }
    document.addEventListener("pointerdown", closeOnOutsideTarget)
    document.addEventListener("focusin", closeOnOutsideTarget)
    document.addEventListener("scroll", closeOnOuterScroll, true)
    window.addEventListener("resize", close)
    return () => {
      if (popover.matches(":popover-open")) popover.hidePopover()
      document.removeEventListener("pointerdown", closeOnOutsideTarget)
      document.removeEventListener("focusin", closeOnOutsideTarget)
      document.removeEventListener("scroll", closeOnOuterScroll, true)
      window.removeEventListener("resize", close)
    }
  }, [isOpen, anchorRef, containerRef, popoverRef, align, matchAnchorWidth])
}
