import { Schema } from "effect"

export const trimmedText = (max: number) => Schema.Trim.check(Schema.isMaxLength(max))
export const requiredText = (max: number) =>
  Schema.Trim.check(Schema.isNonEmpty(), Schema.isMaxLength(max))

// Counts characters, not UTF-16 units, so an emoji is never cut in half.
export const truncate = (text: string, maxLength: number) => {
  const characters = Array.from(text)
  return characters.length <= maxLength ? text : `${characters.slice(0, maxLength - 1).join("")}…`
}
