import { Effect, type Schema } from "effect"

// A row that does not match its schema means code and migrations disagree: a bug, not a
// condition callers can handle, so it becomes a defect.
export const dieOnSchemaError = <A, E, R>(effect: Effect.Effect<A, E | Schema.SchemaError, R>) =>
  Effect.catchTag(effect, "SchemaError", (error) => Effect.die(error))
