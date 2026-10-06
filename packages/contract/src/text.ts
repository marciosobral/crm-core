import { Schema } from "effect"

export const trimmedText = (max: number) => Schema.Trim.check(Schema.isMaxLength(max))
export const requiredText = (max: number) =>
  Schema.Trim.check(Schema.isNonEmpty(), Schema.isMaxLength(max))
