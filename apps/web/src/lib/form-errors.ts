import { SchemaIssue } from "effect"

export const firstPathKey = (segment: PropertyKey | { readonly key: PropertyKey } | undefined) =>
  typeof segment === "object" ? segment.key : segment

export const fieldErrorsFromIssue = <Field extends string>(
  issue: SchemaIssue.Issue,
  messages: Record<Field, string>,
) => {
  const isField = (key: unknown): key is Field => typeof key === "string" && key in messages
  const fieldErrors: Partial<Record<Field, string>> = {}
  for (const standardIssue of SchemaIssue.makeFormatterStandardSchemaV1()(issue).issues) {
    const key = firstPathKey(standardIssue.path?.[0])
    if (isField(key)) fieldErrors[key] ??= messages[key]
  }
  return fieldErrors
}
