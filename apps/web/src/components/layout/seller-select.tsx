import { useSuspenseQuery } from "@tanstack/react-query"
import { Select } from "#src/components/ui/select.tsx"
import { sellersQueryOptions } from "#src/lib/leads.ts"

type SellerSelectProps = {
  value: string
  error: string | undefined
  placeholder: string
  onChange: (value: string) => void
}

export function SellerSelect({ value, error, placeholder, onChange }: SellerSelectProps) {
  const { data: sellers } = useSuspenseQuery(sellersQueryOptions)

  return (
    <Select
      label="Vendedor Responsável"
      required
      value={value}
      error={error}
      name="sellerId"
      searchable
      placeholder={placeholder}
      options={sellers.map((seller) => ({ value: seller.id, label: seller.name }))}
      onChange={onChange}
    />
  )
}
