import type { Seller } from "@crm/contract"

export type SellerMatch =
  | { readonly _tag: "Found"; readonly id: string }
  | { readonly _tag: "Unknown" }
  | { readonly _tag: "Ambiguous" }

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase()
    .trim()

// Matches a name written by the user against the sellers they may see, ignoring case and accents.
// A full-name match wins; otherwise the first name is compared, and a first name shared by several
// sellers is ambiguous.
export const resolveSeller = (name: string, sellers: ReadonlyArray<Seller>): SellerMatch => {
  const wanted = normalize(name)
  if (wanted === "") return { _tag: "Unknown" }
  const fullNameMatches = sellers.filter((seller) => normalize(seller.name) === wanted)
  const matches =
    fullNameMatches.length > 0
      ? fullNameMatches
      : sellers.filter((seller) => normalize(seller.name).split(/\s+/)[0] === wanted)
  const [first, ...others] = matches
  if (first === undefined) return { _tag: "Unknown" }
  return others.length > 0 ? { _tag: "Ambiguous" } : { _tag: "Found", id: first.id }
}
