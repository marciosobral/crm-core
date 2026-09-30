export const phoneDigits = (value: string) => value.replace(/\D/g, "").slice(0, 11)

export const formatPhone = (digits: string) => {
  if (digits.length === 0) return ""
  const area = digits.slice(0, 2)
  if (digits.length <= 2) return `(${area}`
  const localLength = digits.length === 11 ? 5 : 4
  const first = digits.slice(2, 2 + localLength)
  const rest = digits.slice(2 + localLength)
  return rest ? `(${area}) ${first}-${rest}` : `(${area}) ${first}`
}
