import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter"
import { autoScrollForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element"
import { Deal, DealClosed, hasPermission, OpenDealStatus } from "@crm/contract"
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { Option, Schema } from "effect"
import { Plus } from "lucide-react"
import { useEffect, useEffectEvent, useState } from "react"
import { BoardColumn, type MoveFocusRequest } from "#src/components/deals/board-column.tsx"
import { boardColumns } from "#src/components/deals/board-columns.ts"
import { CloseDealDialog } from "#src/components/deals/close-deal-dialog.tsx"
import { DealPanel } from "#src/components/deals/deal-panel.tsx"
import { FiltersBar } from "#src/components/layout/filters-bar.tsx"
import { SellerFilter } from "#src/components/layout/seller-filter.tsx"
import { TopBar } from "#src/components/layout/top-bar.tsx"
import { Button, variantClasses } from "#src/components/ui/button.tsx"
import { SearchInput } from "#src/components/ui/search-input.tsx"
import { runApi } from "#src/lib/api-client.ts"
import { meQueryOptions } from "#src/lib/auth.ts"
import { cn } from "#src/lib/cn.ts"
import { dealsQueryOptions, invalidateDealQueries } from "#src/lib/deals.ts"
import { dealStatusLabels } from "#src/lib/labels.ts"
import { ensureSellersIfPermitted, isVisibleSellerId } from "#src/lib/leads.ts"
import { isDesktop } from "#src/lib/media.ts"
import { useUrlSearch } from "#src/lib/use-url-search.ts"

export const Route = createFileRoute("/_authenticated/deals/")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { search?: string; sellerId?: string; dealId?: string; focus?: "comment" } => ({
    ...(typeof search.search === "string" ? { search: search.search } : {}),
    ...(typeof search.sellerId === "string" ? { sellerId: search.sellerId } : {}),
    ...(typeof search.dealId === "string" ? { dealId: search.dealId } : {}),
    ...(search.focus === "comment" ? { focus: "comment" as const } : {}),
  }),
  // Drops a sellerId the UI cannot show (no permission or unknown seller) so the select always matches the applied filter.
  beforeLoad: async ({ context, search }) => {
    const { sellerId, ...rest } = search
    if (sellerId === undefined) return
    if (!(await isVisibleSellerId(context.queryClient, sellerId, "deal.see_all")))
      throw redirect({ to: "/deals", search: rest, replace: true })
  },
  // Search params are not loader deps: the list query lives in the component so filtering keeps the page mounted.
  loader: async ({ context }) => {
    await ensureSellersIfPermitted(context.queryClient, "deal.see_all")
  },
  component: DealBoard,
})

// Below lg the target columns are off-screen, so dragging near the edge must scroll the board.
const registerAutoScroll = (element: HTMLDivElement) => autoScrollForElements({ element })

const dealCountLabel = (count: number) => {
  if (count === 0) return "Nenhum negócio encontrado"
  return count === 1 ? "1 negócio encontrado" : `${count} negócios encontrados`
}

function DealBoard() {
  const search = Route.useSearch()
  const { dealId: selectedDealId, focus, ...filters } = search
  const navigate = Route.useNavigate()
  const { data: user } = useSuspenseQuery(meQueryOptions)
  const dealsQuery = useQuery({ ...dealsQueryOptions(filters), placeholderData: keepPreviousData })
  const { searchText, onSearchTextChange } = useUrlSearch(
    search.search,
    (value) =>
      void navigate({
        search: ({ search: _previous, ...rest }) => (value ? { ...rest, search: value } : rest),
        replace: true,
      }),
  )
  const queryClient = useQueryClient()
  const [moveError, setMoveError] = useState<string | undefined>(undefined)
  const [announcement, setAnnouncement] = useState("")
  // Moving from the menu remounts the card in its new column (or back, on rollback), which drops focus; the moved card's button takes it back.
  const [focusRequest, setFocusRequest] = useState<MoveFocusRequest | undefined>(undefined)
  const [closing, setClosing] = useState<
    { deal: Deal; mode: "choose" | "WON" | "LOST" } | undefined
  >(undefined)
  const listQueryKey = dealsQueryOptions(filters).queryKey

  const canSeeAll = hasPermission(user, "deal.see_all")
  const canCreate = hasPermission(user, "deal.create")
  const canMove = hasPermission(user, "deal.move")
  const canClose = hasPermission(user, "deal.close")
  const canComment = hasPermission(user, "deal.comment")
  const deals = dealsQuery.data

  const moveMutation = useMutation({
    mutationFn: ({
      deal,
      status,
    }: {
      deal: Deal
      status: OpenDealStatus
      shouldRefocus?: boolean
    }) => runApi((client) => client.deals.move({ params: { id: deal.id }, payload: { status } })),
    onMutate: async ({ deal, status, shouldRefocus }) => {
      setMoveError(undefined)
      await queryClient.cancelQueries({ queryKey: listQueryKey })
      const previous = queryClient.getQueryData(listQueryKey)
      queryClient.setQueryData(listQueryKey, (current) =>
        current?.map((item) => (item.id === deal.id ? new Deal({ ...item, status }) : item)),
      )
      if (shouldRefocus) setFocusRequest({ dealId: deal.id, status })
      return { previous }
    },
    onError: (error, { deal, shouldRefocus }, context) => {
      if (context?.previous) queryClient.setQueryData(listQueryKey, context.previous)
      if (shouldRefocus) setFocusRequest({ dealId: deal.id, status: deal.status })
      setMoveError(
        error instanceof DealClosed
          ? `"${deal.title}" já foi fechado e não pode mais ser movido.`
          : `Não foi possível mover "${deal.title}". Tente novamente.`,
      )
    },
    onSuccess: (_deal, { deal, status }) => {
      setMoveError(undefined)
      setAnnouncement(`Negócio "${deal.title}" movido para ${dealStatusLabels[status]}.`)
    },
    onSettled: () => invalidateDealQueries(queryClient),
  })

  const moveDroppedDeal = useEffectEvent((dealId: unknown, targetStatus: unknown) => {
    const status = Schema.decodeUnknownOption(OpenDealStatus)(targetStatus)
    const deal = deals?.find((item) => item.id === dealId)
    if (Option.isSome(status) && deal && deal.status !== status.value)
      moveMutation.mutate({ deal, status: status.value })
  })

  const closeDroppedDeal = useEffectEvent((dealId: unknown) => {
    const deal = deals?.find((item) => item.id === dealId)
    if (deal) setClosing({ deal, mode: "choose" })
  })

  useEffect(
    () =>
      monitorForElements({
        onDrop: ({ source, location }) => {
          const target = location.current.dropTargets[0]
          if (!target) return
          if (target.data.closing === true) closeDroppedDeal(source.data.dealId)
          else moveDroppedDeal(source.data.dealId, target.data.status)
        },
      }),
    [],
  )

  return (
    <div className="relative flex h-dvh min-w-0 flex-col">
      <TopBar title="Negócios">
        <SearchInput
          label="Buscar negócios"
          className="hidden md:block md:w-64 lg:w-80"
          value={searchText}
          onChange={onSearchTextChange}
        />
        {canCreate && (
          <Link
            to="/deals/new"
            className={cn(
              variantClasses.primary,
              "flex size-[38px] items-center justify-center gap-2 p-0 sm:size-auto sm:px-[18px] sm:py-2.5",
            )}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Novo Negócio</span>
          </Link>
        )}
      </TopBar>

      <FiltersBar
        summary={deals && !dealsQuery.isPlaceholderData ? dealCountLabel(deals.length) : ""}
        search={
          <SearchInput
            label="Buscar negócios"
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
      </FiltersBar>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {moveError && (
        <p
          role="alert"
          className="mx-4 mt-4 rounded-md border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm text-red-400 md:mx-8"
        >
          {moveError}
        </p>
      )}

      {dealsQuery.isError ? (
        <div className="p-4 md:p-8">
          <div className="space-y-3 rounded-xl border border-line bg-surface px-4 py-10 text-center">
            <p role="alert" className="text-sm text-red-400">
              Não foi possível carregar os negócios.
            </p>
            <Button variant="secondary" onClick={() => void dealsQuery.refetch()}>
              Tentar novamente
            </Button>
          </div>
        </div>
      ) : !deals ? (
        <div className="p-4 md:p-8">
          <div className="rounded-xl border border-line bg-surface px-4 py-10 text-center">
            <p className="text-sm text-muted">Carregando...</p>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div
            ref={registerAutoScroll}
            className={cn(
              "min-w-0 flex-1 flex scroll-px-4 snap-x snap-mandatory gap-4 overflow-x-auto p-4 transition-opacity md:scroll-px-8 md:p-8 lg:snap-none",
              dealsQuery.isPlaceholderData && "opacity-60",
            )}
            aria-busy={dealsQuery.isFetching}
          >
            {boardColumns.map((column) => (
              <BoardColumn
                key={column.status}
                column={column}
                deals={deals.filter((deal) => column.statuses.includes(deal.status))}
                canMove={canMove}
                canClose={canClose}
                canComment={canComment}
                selectedDealId={selectedDealId}
                onOpenDeal={(deal) =>
                  void navigate({
                    search: ({ focus: _focus, ...previous }) => ({ ...previous, dealId: deal.id }),
                  })
                }
                focusRequest={focusRequest}
                onMoveButtonFocused={() => setFocusRequest(undefined)}
                onMove={(deal, status) =>
                  moveMutation.mutate({ deal, status, shouldRefocus: true })
                }
                onCloseRequest={(deal, mode) => setClosing({ deal, mode })}
                onCommentRequest={(deal) => {
                  if (isDesktop())
                    void navigate({
                      search: (previous) => ({ ...previous, dealId: deal.id, focus: "comment" }),
                    })
                  else
                    void navigate({
                      to: "/deals/$dealId",
                      params: { dealId: deal.id },
                      search: { focus: "comment" },
                    })
                }}
              />
            ))}
          </div>
          {selectedDealId && (
            <DealPanel
              key={selectedDealId}
              dealId={selectedDealId}
              shouldFocusComposer={focus === "comment"}
              onComposerFocused={() =>
                void navigate({ search: ({ focus: _focus, ...rest }) => rest, replace: true })
              }
              onDismiss={() =>
                void navigate({
                  search: ({ dealId: _dealId, focus: _focus, ...rest }) => rest,
                })
              }
            />
          )}
        </div>
      )}
      {closing && (
        <CloseDealDialog
          key={closing.deal.id}
          deal={closing.deal}
          initialMode={closing.mode}
          onDismiss={() => {
            setFocusRequest({ dealId: closing.deal.id, status: closing.deal.status })
            setClosing(undefined)
          }}
          onClosed={(closedDeal) => {
            queryClient.setQueryData(listQueryKey, (current) =>
              current?.map((item) => (item.id === closedDeal.id ? closedDeal : item)),
            )
            setClosing(undefined)
            setAnnouncement(
              `Negócio "${closedDeal.title}" marcado como ${closedDeal.status === "WON" ? "ganho" : "perdido"}.`,
            )
            setFocusRequest({ dealId: closedDeal.id, status: closedDeal.status })
          }}
        />
      )}
    </div>
  )
}
