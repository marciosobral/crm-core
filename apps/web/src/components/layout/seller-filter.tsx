import { useSuspenseQuery } from "@tanstack/react-query"
import { FilterSelect } from "#src/components/ui/filter-select.tsx"
import { sellersQueryOptions } from "#src/lib/leads.ts"

type SellerFilterProps = {
  sellerId: string | undefined
  onChange: (sellerId: string) => void
}

export function SellerFilter({ sellerId, onChange }: SellerFilterProps) {
  const { data: sellers } = useSuspenseQuery(sellersQueryOptions)

  return (
    <FilterSelect
      label="Vendedor"
      searchable
      value={sellerId ?? ""}
      options={[
        { value: "", label: "Todos" },
        ...sellers.map((seller) => ({ value: seller.id, label: seller.name })),
      ]}
      onChange={onChange}
    />
  )
}
