import { randomBytes, scrypt, timingSafeEqual } from "node:crypto"
import { Effect, Redacted } from "effect"

const keyLength = 64

// scrypt only fails on invalid parameters, which are constants here, so an error is a bug.
const deriveKey = (password: Redacted.Redacted<string>, salt: Buffer) =>
  Effect.callback<Buffer>((resume) => {
    scrypt(Redacted.value(password), salt, keyLength, (error, key) => {
      resume(error ? Effect.die(error) : Effect.succeed(key))
    })
  })

export const hashPassword = (password: Redacted.Redacted<string>) =>
  Effect.gen(function* () {
    const salt = randomBytes(16)
    const key = yield* deriveKey(password, salt)
    return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`
  })

export const verifyPassword = (password: Redacted.Redacted<string>, storedHash: string) =>
  Effect.gen(function* () {
    const [scheme, saltHex, keyHex] = storedHash.split("$")
    if (scheme !== "scrypt" || !saltHex || !keyHex) return false
    const expectedKey = Buffer.from(keyHex, "hex")
    if (expectedKey.length !== keyLength) return false
    const key = yield* deriveKey(password, Buffer.from(saltHex, "hex"))
    return timingSafeEqual(key, expectedKey)
  })
