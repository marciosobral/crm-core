import { useSyncExternalStore } from "react"

export const desktopMediaQuery = "(min-width: 1024px)"

export const isDesktop = () => window.matchMedia(desktopMediaQuery).matches

const subscribeToDesktop = (onChange: () => void) => {
  const query = window.matchMedia(desktopMediaQuery)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

export const useIsDesktop = () => useSyncExternalStore(subscribeToDesktop, isDesktop)
