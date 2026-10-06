import { type Cause, Effect, type Schema } from "effect"

export const escapeLikePattern = (text: string) => text.replace(/[\\%_]/g, "\\$&")

// A row that does not match its schema means code and migrations disagree: a bug, not a
// condition callers can handle, so it becomes a defect.
export const dieOnSchemaError = <A, E, R>(effect: Effect.Effect<A, E | Schema.SchemaError, R>) =>
  Effect.catchTag(effect, "SchemaError", (error) => Effect.die(error))

// A query that always yields one row (RETURNING, SELECT EXISTS) and yields none is a bug, so it becomes a defect.
export const dieOnMissingRow = <A, E, R>(
  effect: Effect.Effect<A, E | Cause.NoSuchElementError, R>,
) => Effect.catchTag(effect, "NoSuchElementError", (error) => Effect.die(error))
