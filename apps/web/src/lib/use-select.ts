import {
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react"
import { useAnchoredPopover } from "./use-anchored-popover.ts"

export type SelectOption = { value: string; label: string }

export type SelectListState = {
  popoverRef: RefObject<HTMLDivElement | null>
  listId: string
  optionId: (index: number) => string
  options: ReadonlyArray<SelectOption>
  value: string
  activeIndex: number
  isListShown: boolean
  statusMessage: string
  onPick: (option: SelectOption) => void
  onHover: (index: number) => void
}

type UseSelectOptions = {
  value: string
  options: ReadonlyArray<SelectOption>
  onChange: (value: string) => void
  isSearchable: boolean
  onSearchChange: ((text: string) => void) | undefined
  isLoading: boolean
  emptyMessage: string
  selectedLabel: string | undefined
  matchAnchorWidth: boolean
}

const searchDebounceMs = 300

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()

// State, filtering, keyboard handling and ARIA wiring shared by every select trigger (field or
// filter, with or without search). Triggers only render their own look and spread what this returns.
export function useSelect({
  value,
  options,
  onChange,
  isSearchable,
  onSearchChange,
  isLoading,
  emptyMessage,
  selectedLabel,
  matchAnchorWidth,
}: UseSelectOptions) {
  const id = useId()
  const listId = `${id}-list`
  const optionId = (index: number) => `${id}-option-${index}`
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  // undefined until the user types; while open it replaces the selected label in the search input.
  const [typedText, setTypedText] = useState<string | undefined>(undefined)
  // The text the server results on screen were requested for.
  const [searchedText, setSearchedText] = useState("")
  const containerRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const triggerElementRef = useRef<HTMLElement | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const triggerRef = useCallback((element: HTMLElement | null) => {
    triggerElementRef.current = element
  }, [])

  const isServerSearch = isSearchable && onSearchChange !== undefined
  const selectedText =
    options.find((option) => option.value === value)?.label ??
    (value === "" ? undefined : selectedLabel) ??
    ""
  // Until the debounced search fires, the options on screen belong to a previous search.
  const isStale = isServerSearch && typedText !== undefined && typedText !== searchedText
  const isLoadingShown = isLoading || isStale
  const visibleOptions =
    isSearchable && !isServerSearch && typedText
      ? options.filter((option) => normalize(option.label).includes(normalize(typedText)))
      : options
  const isListShown = isOpen && !isLoadingShown && visibleOptions.length > 0
  const currentIndex = isListShown && activeIndex < visibleOptions.length ? activeIndex : -1
  const selectedIndex = visibleOptions.findIndex((option) => option.value === value)
  const statusMessage = isOpen
    ? isLoadingShown
      ? "Carregando..."
      : visibleOptions.length === 0
        ? emptyMessage
        : ""
    : ""

  const open = () => {
    if (isOpen) return
    setIsOpen(true)
    setActiveIndex(
      Math.max(
        0,
        options.findIndex((option) => option.value === value),
      ),
    )
    if (triggerElementRef.current instanceof HTMLInputElement) triggerElementRef.current.select()
  }

  const close = () => {
    setIsOpen(false)
    setActiveIndex(-1)
    clearTimeout(debounceRef.current)
    if (typedText === undefined) return
    setTypedText(undefined)
    setSearchedText("")
    if (isServerSearch) onSearchChange("")
  }

  const toggle = () => {
    triggerElementRef.current?.focus()
    if (isOpen) close()
    else open()
  }

  const pick = (option: SelectOption) => {
    onChange(option.value)
    close()
  }

  useAnchoredPopover({
    isOpen,
    anchorRef: containerRef,
    containerRef,
    popoverRef,
    align: "start",
    matchAnchorWidth,
    onClose: close,
  })

  useEffect(() => {
    if (isOpen && currentIndex >= 0)
      document.getElementById(`${id}-option-${currentIndex}`)?.scrollIntoView({ block: "nearest" })
  }, [id, isOpen, currentIndex])

  useEffect(() => () => clearTimeout(debounceRef.current), [])

  const openFromBox = (event: MouseEvent<HTMLElement>) => {
    // The chevron button toggles on its own.
    if (event.target instanceof Element && event.target.closest("button")) return
    triggerElementRef.current?.focus()
    open()
  }

  const moveActive = (step: 1 | -1) => {
    const count = visibleOptions.length
    if (!isListShown) return
    if (currentIndex < 0) setActiveIndex(step > 0 ? 0 : count - 1)
    else setActiveIndex((currentIndex + step + count) % count)
  }

  const jumpToLetter = (letter: string, fromIndex: number) => {
    const count = visibleOptions.length
    for (let offset = 1; offset <= count; offset++) {
      const index = (fromIndex + offset) % count
      if (normalize(visibleOptions[index]?.label ?? "").startsWith(letter)) {
        setActiveIndex(index)
        return
      }
    }
  }

  const pickActive = () => {
    const option = visibleOptions[currentIndex]
    if (option) pick(option)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      if (isOpen) moveActive(event.key === "ArrowDown" ? 1 : -1)
      else open()
    } else if ((event.key === "Home" || event.key === "End") && !isSearchable) {
      // In the search input Home/End keep moving the caret.
      event.preventDefault()
      open()
      setActiveIndex(event.key === "Home" ? 0 : visibleOptions.length - 1)
    } else if (event.key === "Enter" || (event.key === " " && !isSearchable)) {
      if (!isOpen && isSearchable) return
      event.preventDefault()
      if (isOpen) pickActive()
      else open()
    } else if (event.key === "Escape") {
      if (!isOpen) return
      event.preventDefault()
      close()
    } else if (event.key === "Tab") {
      if (isOpen) close()
    } else if (
      !isSearchable &&
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      open()
      jumpToLetter(normalize(event.key), isOpen ? currentIndex : selectedIndex)
    }
  }

  const onInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const text = event.target.value
    setTypedText(text)
    setIsOpen(true)
    if (!isServerSearch) {
      setActiveIndex(0)
      return
    }
    setActiveIndex(-1)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setSearchedText(text)
      setActiveIndex(0)
      onSearchChange(text)
    }, searchDebounceMs)
  }

  const list: SelectListState = {
    popoverRef,
    listId,
    optionId,
    options: visibleOptions,
    value,
    activeIndex: currentIndex,
    isListShown,
    statusMessage,
    onPick: pick,
    onHover: setActiveIndex,
  }

  return {
    id,
    isOpen,
    toggle,
    containerRef,
    triggerRef,
    selectedText,
    openFromBox,
    list,
    searchInputProps: {
      type: "text",
      autoComplete: "off",
      "aria-autocomplete": "list",
      value: isOpen && typedText !== undefined ? typedText : selectedText,
      onChange: onInputChange,
    } as const,
    triggerProps: {
      role: "combobox",
      "aria-haspopup": "listbox",
      "aria-expanded": isOpen,
      "aria-controls": isListShown ? listId : undefined,
      "aria-activedescendant":
        isListShown && currentIndex >= 0 ? optionId(currentIndex) : undefined,
      onKeyDown,
      // Firefox activates a focused button on Space keyup even when keydown was prevented.
      onKeyUp: (event: KeyboardEvent<HTMLElement>) => {
        if (event.key === " " && !isSearchable) event.preventDefault()
      },
      onClick: () => {
        if (isSearchable) open()
        else toggle()
      },
    } as const,
  }
}
