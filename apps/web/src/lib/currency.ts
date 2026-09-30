const withCents = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
const withoutCents = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
})

export const formatCents = (cents: number) => withCents.format(cents / 100)

export const formatDealValue = (cents: number) =>
  cents % 100 === 0 ? withoutCents.format(cents / 100) : withCents.format(cents / 100)

// Typing fills the value from the right, like a cash register: "8", "89", "890" -> R$ 0,08, R$ 0,89, R$ 8,90.
export const centsFromInput = (text: string) => {
  const digits = text.replace(/\D/g, "").replace(/^0+/, "").slice(0, 11)
  return digits === "" ? 0 : Number(digits)
}
