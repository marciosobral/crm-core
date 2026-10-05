import { DealStatus, hasPermission } from "@crm/contract"
import { keepPreviousData, useQuery, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { Option, Schema } from "effect"
import { Plus } from "lucide-react"
import { FiltersBar } from "#src/components/layout/filters-bar.tsx"
import { SellerFilter } from "#src/components/layout/seller-filter.tsx"
import { TopBar } from "#src/components/layout/top-bar.tsx"
import { variantClasses } from "#src/components/ui/button.tsx"
import { FilterSelect } from "#src/components/ui/filter-select.tsx"
import { SearchInput } from "#src/components/ui/search-input.tsx"
import { StatusBadge } from "#src/components/ui/status-badge.tsx"
import { Table, TableCell, TableHead, TableRow } from "#src/components/ui/table.tsx"
import { meQueryOptions } from "#src/lib/auth.ts"
import { cn } from "#src/lib/cn.ts"
import { dealStatusLabels } from "#src/lib/labels.ts"
import { isVisibleSellerId, leadsQueryOptions, sellersQueryOptions } from "#src/lib/leads.ts"
import { formatPhone } from "#src/lib/phone.ts"
import { useUrlSearch } from "#src/lib/use-url-search.ts"

export const Route = createFileRoute("/_authenticated/leads/")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { search?: string; sellerId?: string; status?: DealStatus } => ({
    ...(typeof search.search === "string" ? { search: search.search } : {}),
    ...(typeof search.sellerId === "string" ? { sellerId: search.sellerId } : {}),
    ...(Schema.is(DealStatus)(search.status) ? { status: search.status } : {}),
  }),
  // Drops a sellerId the UI cannot show (no permission or unknown seller) so the select always matches the applied filter.
  beforeLoad: async ({ context, search }) => {
    const { sellerId, ...rest } = search
    if (sellerId === undefined) return
    if (!(await isVisibleSellerId(context.queryClient, sellerId, "lead.see_all")))
      throw redirect({ to: "/leads", search: rest, replace: true })
  },
  // Search params are not loader deps: the list query lives in the component so filtering keeps the page mounted.
  loader: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(meQueryOptions)
    if (hasPermission(user, "lead.see_all"))
      await context.queryClient.ensureQueryData(sellersQueryOptions)
  },
  component: LeadList,
})

const leadCountLabel = (count: number) => {
  if (count === 0) return "Nenhum lead encontrado"
  return count === 1 ? "1 lead encontrado" : `${count} leads encontrados`
}

function LeadList() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data: user } = useSuspenseQuery(meQueryOptions)
  const leadsQuery = useQuery({ ...leadsQueryOptions(search), placeholderData: keepPreviousData })
  const { searchText, onSearchTextChange } = useUrlSearch(
    search.search,
    (value) =>
      void navigate({
        search: ({ search: _previous, ...rest }) => (value ? { ...rest, search: value } : rest),
        replace: true,
      }),
  )

  const canSeeAll = hasPermission(user, "lead.see_all")
  const canCreate = hasPermission(user, "lead.create")
  const hasFilters = Boolean(search.search || search.sellerId || search.status)
  const leads = leadsQuery.data

  return (
    <>
      <TopBar title="Lista de Leads">
        <SearchInput
          label="Buscar leads"
          className="hidden md:block md:w-64 lg:w-80"
          value={searchText}
          onChange={onSearchTextChange}
        />
        {canCreate && (
          <Link
            to="/leads/new"
            className={cn(
              variantClasses.primary,
              "flex size-[38px] items-center justify-center gap-2 p-0 sm:size-auto sm:px-[18px] sm:py-2.5",
            )}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Novo Lead</span>
          </Link>
        )}
      </TopBar>

      <FiltersBar
        summary={leads && !leadsQuery.isPlaceholderData ? leadCountLabel(leads.length) : ""}
        search={
          <SearchInput
            label="Buscar leads"
            className="w-full"
            value={searchText}
            onChange={onSearchTextChange}
          />
        }
      >
        {canSeeAll && (
          <SellerFilter
            sellerId={search.sellerId}
            onChange={(sellerId) =>
              void navigate({
                search: ({ sellerId: _previous, ...rest }) =>
                  sellerId ? { ...rest, sellerId } : rest,
              })
            }
          />
        )}
        <FilterSelect
          label="Status"
          value={search.status ?? ""}
          options={[
            { value: "", label: "Todos" },
            ...DealStatus.literals.map((status) => ({
              value: status,
              label: dealStatusLabels[status],
            })),
          ]}
          onChange={(value) =>
            void navigate({
              search: ({ status: _previous, ...rest }) => {
                const status = Schema.decodeUnknownOption(DealStatus)(value)
                return Option.isSome(status) ? { ...rest, status: status.value } : rest
              },
            })
          }
        />
      </FiltersBar>

      <section className="p-4 md:p-8">
        {leadsQuery.isError ? (
          <div className="rounded-xl border border-line bg-surface px-4 py-10 text-center">
            <p role="alert" className="text-sm text-red-400">
              Não foi possível carregar os leads.
            </p>
          </div>
        ) : !leads ? (
          <div className="rounded-xl border border-line bg-surface px-4 py-10 text-center">
            <p className="text-sm text-muted">Carregando...</p>
          </div>
        ) : leads.length === 0 ? (
          <div className="space-y-3 rounded-xl border border-line bg-surface px-4 py-10 text-center">
            <p className="text-sm text-muted">Nenhum lead encontrado.</p>
            {canCreate && !hasFilters && (
              <Link to="/leads/new" className={cn(variantClasses.primary, "inline-block")}>
                Criar lead
              </Link>
            )}
          </div>
        ) : (
          <div
            className={cn("transition-opacity", leadsQuery.isPlaceholderData && "opacity-60")}
            aria-busy={leadsQuery.isFetching}
          >
            <Table>
              <thead>
                <TableRow className="bg-surface-raised">
                  <TableHead>Nome</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Status</TableHead>
                  {canSeeAll && <TableHead>Vendedor</TableHead>}
                </TableRow>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <TableRow key={lead.id} className="h-14 last:border-b-0 hover:bg-surface-raised">
                    <TableCell>{lead.name}</TableCell>
                    <TableCell isSecondary>{lead.company}</TableCell>
                    <TableCell isSecondary>{lead.email}</TableCell>
                    <TableCell isSecondary>{formatPhone(lead.phone)}</TableCell>
                    <TableCell>
                      <StatusBadge status={lead.status} />
                    </TableCell>
                    {canSeeAll && <TableCell>{lead.seller.name}</TableCell>}
                  </TableRow>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </section>
    </>
  )
}
