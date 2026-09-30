import { type RefObject, useEffect, useEffectEvent } from "react"

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
// can clip it, follows the anchor on scroll/resize and closes it on outside pointerdown/focus.
export function useAnchoredPopover({
  isOpen,
  anchorRef,
  containerRef,
  popoverRef,
  align,
  matchAnchorWidth = false,
  onClose,
}: AnchoredPopoverOptions) {
  const close = useEffectEvent(onClose)

  useEffect(() => {
    const popover = popoverRef.current
    const anchor = anchorRef.current
    if (!isOpen || !popover || !anchor) return
    popover.showPopover()
    const position = () => {
      const rect = anchor.getBoundingClientRect()
      if (matchAnchorWidth) popover.style.width = `${rect.width}px`
      const hasRoomBelow = rect.bottom + gap + popover.offsetHeight <= window.innerHeight
      popover.style.top = `${hasRoomBelow ? rect.bottom + gap : Math.max(gap, rect.top - gap - popover.offsetHeight)}px`
      popover.style.left = `${
        align === "end"
          ? Math.max(gap, rect.right - popover.offsetWidth)
          : Math.max(gap, Math.min(rect.left, window.innerWidth - popover.offsetWidth - gap))
      }px`
    }
    position()

    const closeOnOutsideTarget = (event: Event) => {
      if (!(event.target instanceof Node)) return
      const isInside =
        containerRef.current?.contains(event.target) || popover.contains(event.target)
      if (!isInside) close()
    }
    // Scrolling (also the page jumping when a mobile keyboard opens) and resizing keep the list open
    // and follow the anchor; it only closes once the anchor is entirely out of the viewport.
    const reposition = () => {
      const rect = anchor.getBoundingClientRect()
      const isAnchorOffscreen =
        rect.bottom <= 0 ||
        rect.top >= window.innerHeight ||
        rect.right <= 0 ||
        rect.left >= window.innerWidth
      if (isAnchorOffscreen) close()
      else position()
    }
    const repositionOnOuterScroll = (event: Event) => {
      if (event.target instanceof Node && popover.contains(event.target)) return
      reposition()
    }
    const resizeObserver = new ResizeObserver(position)
    resizeObserver.observe(popover)
    document.addEventListener("pointerdown", closeOnOutsideTarget)
    document.addEventListener("focusin", closeOnOutsideTarget)
    document.addEventListener("scroll", repositionOnOuterScroll, true)
    window.addEventListener("resize", reposition)
    return () => {
      resizeObserver.disconnect()
      if (popover.matches(":popover-open")) popover.hidePopover()
      document.removeEventListener("pointerdown", closeOnOutsideTarget)
      document.removeEventListener("focusin", closeOnOutsideTarget)
      document.removeEventListener("scroll", repositionOnOuterScroll, true)
      window.removeEventListener("resize", reposition)
    }
  }, [isOpen, anchorRef, containerRef, popoverRef, align, matchAnchorWidth])
}
