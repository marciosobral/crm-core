import { DealStatus, hasPermission } from "@crm/contract"
import { keepPreviousData, useQuery, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { Option, Schema } from "effect"
import { Plus, Search } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { FiltersBar } from "../../../components/layout/filters-bar.tsx"
import { TopBar } from "../../../components/layout/top-bar.tsx"
import { variantClasses } from "../../../components/ui/button.tsx"
import { FilterSelect } from "../../../components/ui/filter-select.tsx"
import { StatusBadge } from "../../../components/ui/status-badge.tsx"
import { Table, TableCell, TableHead, TableRow } from "../../../components/ui/table.tsx"
import { meQueryOptions } from "../../../lib/auth.ts"
import { cn } from "../../../lib/cn.ts"
import { dealStatusLabels } from "../../../lib/labels.ts"
import { leadsQueryOptions, sellersQueryOptions } from "../../../lib/leads.ts"
import { formatPhone } from "../../../lib/phone.ts"

export const Route = createFileRoute("/_authenticated/leads/")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { search?: string; sellerId?: string; status?: DealStatus } => ({
    ...(typeof search.search === "string" ? { search: search.search } : {}),
    ...(typeof search.sellerId === "string" ? { sellerId: search.sellerId } : {}),
    ...(Schema.is(DealStatus)(search.status) ? { status: search.status } : {}),
  }),
  // Search params are not loader deps: the list query lives in the component so filtering keeps the page mounted.
  // Drops a sellerId the UI cannot show (no permission or unknown seller) so the select always matches the applied filter.
  beforeLoad: async ({ context, search }) => {
    const { sellerId, ...rest } = search
    if (sellerId === undefined) return
    const user = await context.queryClient.ensureQueryData(meQueryOptions)
    const sellers = hasPermission(user, "lead.see_all")
      ? await context.queryClient.ensureQueryData(sellersQueryOptions)
      : []
    if (!sellers.some((seller) => seller.id === sellerId))
      throw redirect({ to: "/leads", search: rest, replace: true })
  },
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

function SellerFilter({
  sellerId,
  onChange,
}: {
  sellerId: string | undefined
  onChange: (sellerId: string) => void
}) {
  const { data: sellers } = useSuspenseQuery(sellersQueryOptions)

  return (
    <FilterSelect
      label="Vendedor"
      value={sellerId ?? ""}
      options={[
        { value: "", label: "Todos" },
        ...sellers.map((seller) => ({ value: seller.id, label: seller.name })),
      ]}
      onChange={onChange}
    />
  )
}

function LeadSearch({
  className,
  value,
  onChange,
}: {
  className: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className={cn("relative", className)}>
      <Search
        className="pointer-events-none absolute top-1/2 left-4 size-3.5 -translate-y-1/2 text-muted"
        aria-hidden="true"
      />
      <input
        type="search"
        aria-label="Buscar leads"
        placeholder="Buscar..."
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-[34px] w-full rounded-md border border-line bg-canvas pr-4 pl-[38px] text-sm leading-none outline-none placeholder:text-placeholder focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/40"
      />
    </div>
  )
}

function LeadList() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data: user } = useSuspenseQuery(meQueryOptions)
  const leadsQuery = useQuery({ ...leadsQueryOptions(search), placeholderData: keepPreviousData })
  const [searchText, setSearchText] = useState(search.search ?? "")
  const pushedSearchRef = useRef(search.search)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const canSeeAll = hasPermission(user, "lead.see_all")
  const canCreate = hasPermission(user, "lead.create")
  const hasFilters = Boolean(search.search || search.sellerId || search.status)
  const leads = leadsQuery.data

  // Only URL changes that did not come from typing (sidebar link, back/forward) overwrite the input.
  useEffect(() => {
    if (search.search === pushedSearchRef.current) return
    pushedSearchRef.current = search.search
    clearTimeout(debounceRef.current)
    setSearchText(search.search ?? "")
  }, [search.search])

  useEffect(() => () => clearTimeout(debounceRef.current), [])

  const onSearchTextChange = (value: string) => {
    setSearchText(value)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      pushedSearchRef.current = value || undefined
      void navigate({
        search: ({ search: _previous, ...rest }) => (value ? { ...rest, search: value } : rest),
        replace: true,
      })
    }, 300)
  }

  return (
    <>
      <TopBar title="Lista de Leads">
        <LeadSearch
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
        search={<LeadSearch className="w-full" value={searchText} onChange={onSearchTextChange} />}
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
