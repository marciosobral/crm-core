import { inspect } from "node:util"
import { expect, it } from "@effect/vitest"
import { Effect, Logger, References } from "effect"
import { SqlError } from "effect/unstable/sql"
import { failUnavailable } from "./unavailable.ts"

it.effect("logs the reason tag without the driver error", () =>
  Effect.gen(function* () {
    const logged: Array<string> = []
    const collector = Logger.make(({ message, cause, fiber }) => {
      logged.push(
        inspect(
          { message, cause, annotations: fiber.getRef(References.CurrentLogAnnotations) },
          { depth: 10 },
        ),
      )
    })
    const error = new SqlError.SqlError({
      reason: new SqlError.ConstraintError({
        cause: new Error("Key (email)=(private@example.com) already exists."),
        message: 'duplicate key value violates unique constraint "users_email_key"',
      }),
    })

    yield* failUnavailable(error).pipe(Effect.flip, Effect.provide(Logger.layer([collector])))

    const output = logged.join("\n")
    expect(output).toContain("ConstraintError")
    expect(output).not.toContain("private@example.com")
    expect(output).not.toContain("users_email_key")
  }),
)
