import { expect, it } from "@effect/vitest"
import { Effect, Redacted } from "effect"
import { hashPassword, verifyPassword } from "./password.ts"

const password = Redacted.make("correct-horse-battery")

it.effect("verifies a password against its own hash", () =>
  Effect.gen(function* () {
    const storedHash = yield* hashPassword(password)
    expect(storedHash).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/)
    expect(yield* verifyPassword(password, storedHash)).toBe(true)
  }),
)

it.effect("rejects a wrong password", () =>
  Effect.gen(function* () {
    const storedHash = yield* hashPassword(password)
    expect(yield* verifyPassword(Redacted.make("wrong-password"), storedHash)).toBe(false)
  }),
)

it.effect("rejects a malformed stored hash", () =>
  Effect.gen(function* () {
    expect(yield* verifyPassword(password, "not-a-hash")).toBe(false)
  }),
)
