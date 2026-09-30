import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { meQueryOptions } from "../../lib/auth.ts"

export const Route = createFileRoute("/_authenticated/")({
  component: Home,
})

function Home() {
  const { data: user } = useSuspenseQuery(meQueryOptions)

  return (
    <>
      <header className="border-b border-line px-8 py-5">
        <h1 className="text-xl font-semibold">Início</h1>
      </header>
      <section className="px-8 py-6">
        <p className="text-zinc-300">Olá, {user.name}!</p>
      </section>
    </>
  )
}
