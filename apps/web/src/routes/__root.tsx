import { createRootRoute, Outlet } from "@tanstack/react-router"

export const Route = createRootRoute({
  component: () => (
    <main className="min-h-screen bg-slate-50 p-8 text-slate-900">
      <Outlet />
    </main>
  ),
})
