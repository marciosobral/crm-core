import { createContext, createRef } from "react"

export const NavDrawerContext = createContext({
  isNavOpen: false,
  openNav: () => {},
  menuButtonRef: createRef<HTMLButtonElement>(),
})
