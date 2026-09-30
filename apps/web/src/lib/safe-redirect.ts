// Only same-app paths are allowed after login; "//host" and "/\host" would leave the site and /login would loop.
export const safeRedirect = (target: string | undefined) =>
  target?.startsWith("/") &&
  !target.startsWith("//") &&
  !target.startsWith("/\\") &&
  !target.startsWith("/login")
    ? target
    : "/"
