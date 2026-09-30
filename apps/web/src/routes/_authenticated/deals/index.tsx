import { createFileRoute } from "@tanstack/react-router"
import { TopBar } from "../../../components/layout/top-bar.tsx"

export const Route = createFileRoute("/_authenticated/deals/")({ component: DealBoard })

function DealBoard() {
  return <TopBar title="Negócios" />
}
