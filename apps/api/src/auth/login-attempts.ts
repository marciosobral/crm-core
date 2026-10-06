import { Clock, Context, Effect, Layer, Ref, Result, Schema, Semaphore } from "effect"

const maxFailures = 5
const windowMillis = 15 * 60 * 1000
const defaultMaxTrackedEmails = 10_000
// Two permits keep scrypt from filling the 4-thread libuv pool that pg DNS lookups also use.
const verificationPermits = 2
const maxWaitingVerifications = 20

export class VerificationQueueFull extends Schema.TaggedError<VerificationQueueFull>()(
  "VerificationQueueFull",
  {},
) {}

const normalizeEmail = (email: string) => email.trim().toLowerCase()

export class LoginAttempts extends Context.Service<
  LoginAttempts,
  {
    readonly reserveAttempt: (email: string) => Effect.Effect<Result.Result<number, number>>
    readonly releaseAttempt: (email: string, reservedAt: number) => Effect.Effect<void>
    readonly clear: (email: string) => Effect.Effect<void>
    readonly withVerificationSlot: <A, E, R>(
      effect: Effect.Effect<A, E, R>,
    ) => Effect.Effect<A, E | VerificationQueueFull, R>
  }
>()("crm/LoginAttempts") {}

const failuresInWindow = (
  failures: ReadonlyArray<number> | undefined,
  now: number,
): ReadonlyArray<number> => (failures ?? []).filter((failedAt) => failedAt > now - windowMillis)

// Never evicts a limited key or the key being reserved: flooding with made-up emails must not
// reset a blocked account. The map may stay over the cap when every other key is limited.
const evictOverflow = (
  failuresByEmail: Map<string, ReadonlyArray<number>>,
  keptKey: string,
  now: number,
  maxTrackedEmails: number,
) => {
  if (failuresByEmail.size <= maxTrackedEmails) return
  for (const [key, failures] of failuresByEmail)
    if (failuresInWindow(failures, now).length === 0) failuresByEmail.delete(key)
  if (failuresByEmail.size <= maxTrackedEmails) return
  let evictableKey: string | undefined
  let evictableCount = Number.POSITIVE_INFINITY
  let evictableNewest = Number.POSITIVE_INFINITY
  for (const [key, failures] of failuresByEmail) {
    const failureCount = failuresInWindow(failures, now).length
    if (key === keptKey || failureCount >= maxFailures) continue
    const newestFailure = failures[failures.length - 1] ?? 0
    if (
      failureCount < evictableCount ||
      (failureCount === evictableCount && newestFailure < evictableNewest)
    ) {
      evictableKey = key
      evictableCount = failureCount
      evictableNewest = newestFailure
    }
  }
  if (evictableKey !== undefined) failuresByEmail.delete(evictableKey)
}

type Reservation = readonly [
  Result.Result<number, number>,
  ReadonlyMap<string, ReadonlyArray<number>>,
]

export const makeLoginAttempts = ({
  maxTrackedEmails = defaultMaxTrackedEmails,
}: {
  readonly maxTrackedEmails?: number
} = {}) =>
  Effect.gen(function* () {
    const failuresByEmail = yield* Ref.make<ReadonlyMap<string, ReadonlyArray<number>>>(new Map())
    const semaphore = yield* Semaphore.make(verificationPermits)
    const inFlightVerifications = yield* Ref.make(0)

    const admitVerification = Ref.modify(inFlightVerifications, (inFlight) => {
      const isAdmitted = inFlight < verificationPermits + maxWaitingVerifications
      return isAdmitted ? [true, inFlight + 1] : [false, inFlight]
    })
    const releaseVerification = (isAdmitted: boolean) =>
      isAdmitted ? Ref.update(inFlightVerifications, (inFlight) => inFlight - 1) : Effect.void

    return LoginAttempts.of({
      // The attempt is counted up front, in the same atomic step as the limit check, so parallel
      // guesses cannot all pass before any failure is recorded. Unknown emails are counted like
      // known ones so a 429 never reveals whether an account exists.
      reserveAttempt: (email) =>
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis
          const key = normalizeEmail(email)
          return yield* Ref.modify(failuresByEmail, (current): Reservation => {
            const failures = failuresInWindow(current.get(key), now)
            const oldestFailure = failures[0]
            if (oldestFailure !== undefined && failures.length >= maxFailures)
              return [
                Result.fail(Math.max(1, Math.ceil((oldestFailure + windowMillis - now) / 1000))),
                current,
              ]
            const next = new Map(current)
            next.set(key, [...failures, now])
            evictOverflow(next, key, now, maxTrackedEmails)
            return [Result.succeed(now), next]
          })
        }),
      releaseAttempt: (email, reservedAt) =>
        Ref.update(failuresByEmail, (current) => {
          const key = normalizeEmail(email)
          const failures = current.get(key)
          const reservedIndex = failures?.indexOf(reservedAt) ?? -1
          if (failures === undefined || reservedIndex === -1) return current
          const next = new Map(current)
          const remaining = failures.filter((_, index) => index !== reservedIndex)
          if (remaining.length === 0) next.delete(key)
          else next.set(key, remaining)
          return next
        }),
      clear: (email) =>
        Ref.update(failuresByEmail, (current) => {
          const next = new Map(current)
          next.delete(normalizeEmail(email))
          return next
        }),
      withVerificationSlot: <A, E, R>(
        effect: Effect.Effect<A, E, R>,
      ): Effect.Effect<A, E | VerificationQueueFull, R> =>
        Effect.acquireUseRelease(
          admitVerification,
          (isAdmitted): Effect.Effect<A, E | VerificationQueueFull, R> => {
            if (!isAdmitted) return Effect.fail(new VerificationQueueFull())
            // scrypt keeps running on the threadpool after an interruption, so the permit must be held
            // until it finishes or aborted requests would bypass the concurrency cap.
            return semaphore.withPermits(1)(Effect.uninterruptible(effect))
          },
          releaseVerification,
        ),
    })
  })

export const LoginAttemptsLive = Layer.effect(LoginAttempts, makeLoginAttempts())
