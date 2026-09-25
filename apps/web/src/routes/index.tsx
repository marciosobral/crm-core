import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { runApi } from "../lib/api-client.ts"

export const Route = createFileRoute("/")({
  component: Home,
})

function Home() {
  const healthQuery = useQuery({
    queryKey: ["health"],
    queryFn: () => runApi((client) => client.health.ready()),
  })

  return (
    <section className="space-y-2">
      <h1 className="text-2xl font-semibold">CRM</h1>
      <p className="text-sm text-slate-600">
        API:{" "}
        {healthQuery.isPending
          ? "verificando..."
          : healthQuery.isError
            ? "indisponível"
            : healthQuery.data.status}
      </p>
    </section>
  )
}
