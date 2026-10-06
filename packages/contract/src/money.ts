const withCents = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
const withoutCents = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
})

export const formatCents = (cents: number) => withCents.format(cents / 100)

export const formatDealValue = (cents: number) =>
  cents % 100 === 0 ? withoutCents.format(cents / 100) : withCents.format(cents / 100)
