import { useEffect, useRef, useState } from "react"

export function useUrlSearch(
  search: string | undefined,
  pushSearch: (value: string | undefined) => void,
) {
  const [searchText, setSearchText] = useState(search ?? "")
  const pushedSearchRef = useRef(search)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Only URL changes that did not come from typing (sidebar link, back/forward) overwrite the input.
  useEffect(() => {
    if (search === pushedSearchRef.current) return
    pushedSearchRef.current = search
    clearTimeout(debounceRef.current)
    setSearchText(search ?? "")
  }, [search])

  useEffect(() => () => clearTimeout(debounceRef.current), [])

  const onSearchTextChange = (value: string) => {
    setSearchText(value)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      pushedSearchRef.current = value || undefined
      pushSearch(value || undefined)
    }, 300)
  }

  return { searchText, onSearchTextChange }
}
