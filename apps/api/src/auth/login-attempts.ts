import { Clock, Context, Effect, Layer, Ref, Result, Schema, Semaphore } from "effect"

interface Limit {
  readonly maxCount: number
  readonly windowMillis: number
}

const failureLimit: Limit = { maxCount: 5, windowMillis: 15 * 60 * 1000 }
const clientAttemptLimit: Limit = { maxCount: 20, windowMillis: 60 * 1000 }
const defaultMaxTrackedKeys = 10_000
// Two permits keep scrypt from filling the 4-thread libuv pool that pg DNS lookups also use.
const verificationPermits = 2
const maxWaitingVerifications = 20
// Keeps one client from taking the whole queue with parallel requests.
const maxVerificationsPerClient = 2

export class VerificationQueueFull extends Schema.TaggedError<VerificationQueueFull>()(
  "VerificationQueueFull",
  {},
) {}

export class ClientVerificationBusy extends Schema.TaggedError<ClientVerificationBusy>()(
  "ClientVerificationBusy",
  {},
) {}

const normalizeEmail = (email: string) => email.trim().toLowerCase()

export class LoginAttempts extends Context.Service<
  LoginAttempts,
  {
    readonly reserveClientAttempt: (
      clientIp: string,
    ) => Effect.Effect<Result.Result<number, number>>
    readonly reserveAttempt: (email: string) => Effect.Effect<Result.Result<number, number>>
    readonly releaseAttempt: (email: string, reservedAt: number) => Effect.Effect<void>
    readonly clear: (email: string) => Effect.Effect<void>
    readonly withVerificationSlot: <A, E, R>(
      clientIp: string,
      effect: Effect.Effect<A, E, R>,
    ) => Effect.Effect<A, E | VerificationQueueFull | ClientVerificationBusy, R>
  }
>()("crm/LoginAttempts") {}

type Timestamps = ReadonlyMap<string, ReadonlyArray<number>>

type Reservation = readonly [Result.Result<number, number>, Timestamps]

const timestampsInWindow = (
  timestamps: ReadonlyArray<number> | undefined,
  now: number,
  { windowMillis }: Limit,
): ReadonlyArray<number> => (timestamps ?? []).filter((at) => at > now - windowMillis)

// Drops the oldest-inserted key that is not limited. Never evicts a limited key or the key being
// reserved: flooding with made-up keys must not reset a blocked one. The map may stay over the cap
// when every other key is limited.
const evictOverflow = (
  timestampsByKey: Map<string, ReadonlyArray<number>>,
  keptKey: string,
  now: number,
  maxTrackedKeys: number,
  limit: Limit,
) => {
  if (timestampsByKey.size <= maxTrackedKeys) return
  for (const [key, timestamps] of timestampsByKey)
    if (key !== keptKey && timestampsInWindow(timestamps, now, limit).length < limit.maxCount) {
      timestampsByKey.delete(key)
      return
    }
}

const reserveInWindow = (
  current: Timestamps,
  key: string,
  now: number,
  maxTrackedKeys: number,
  limit: Limit,
): Reservation => {
  const timestamps = timestampsInWindow(current.get(key), now, limit)
  const oldest = timestamps[0]
  if (oldest !== undefined && timestamps.length >= limit.maxCount)
    return [
      Result.fail(Math.max(1, Math.ceil((oldest + limit.windowMillis - now) / 1000))),
      current,
    ]
  const next = new Map(current)
  next.set(key, [...timestamps, now])
  evictOverflow(next, key, now, maxTrackedKeys, limit)
  return [Result.succeed(now), next]
}

const releaseFromWindow = (current: Timestamps, key: string, reservedAt: number): Timestamps => {
  const timestamps = current.get(key)
  const reservedIndex = timestamps?.indexOf(reservedAt) ?? -1
  if (timestamps === undefined || reservedIndex === -1) return current
  const next = new Map(current)
  const remaining = timestamps.filter((_, index) => index !== reservedIndex)
  if (remaining.length === 0) next.delete(key)
  else next.set(key, remaining)
  return next
}

type VerificationAdmission = "admitted" | "queue-full" | "client-busy"

interface InFlightVerifications {
  readonly total: number
  readonly byClient: ReadonlyMap<string, number>
}

export const makeLoginAttempts = ({
  maxTrackedKeys = defaultMaxTrackedKeys,
}: {
  readonly maxTrackedKeys?: number
} = {}) =>
  Effect.gen(function* () {
    const failuresByEmail = yield* Ref.make<Timestamps>(new Map())
    const attemptsByClient = yield* Ref.make<Timestamps>(new Map())
    const semaphore = yield* Semaphore.make(verificationPermits)
    const inFlight = yield* Ref.make<InFlightVerifications>({ total: 0, byClient: new Map() })

    const admitVerification = (clientIp: string) =>
      Ref.modify(inFlight, (current): readonly [VerificationAdmission, InFlightVerifications] => {
        const clientCount = current.byClient.get(clientIp) ?? 0
        if (clientCount >= maxVerificationsPerClient) return ["client-busy", current]
        if (current.total >= verificationPermits + maxWaitingVerifications)
          return ["queue-full", current]
        return [
          "admitted",
          {
            total: current.total + 1,
            byClient: new Map(current.byClient).set(clientIp, clientCount + 1),
          },
        ]
      })
    const releaseVerification = (clientIp: string) => (admission: VerificationAdmission) =>
      admission === "admitted"
        ? Ref.update(inFlight, (current) => {
            const byClient = new Map(current.byClient)
            const remaining = (byClient.get(clientIp) ?? 1) - 1
            if (remaining === 0) byClient.delete(clientIp)
            else byClient.set(clientIp, remaining)
            return { total: current.total - 1, byClient }
          })
        : Effect.void

    return LoginAttempts.of({
      // Counts every attempt, successful or not: a flood of made-up emails from one client must be
      // stopped before it reaches the scrypt queue shared by everyone.
      reserveClientAttempt: (clientIp) =>
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis
          return yield* Ref.modify(attemptsByClient, (current) =>
            reserveInWindow(current, clientIp, now, maxTrackedKeys, clientAttemptLimit),
          )
        }),
      // The attempt is counted up front, in the same atomic step as the limit check, so parallel
      // guesses cannot all pass before any failure is recorded. Unknown emails are counted like
      // known ones so a 429 never reveals whether an account exists.
      reserveAttempt: (email) =>
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis
          return yield* Ref.modify(failuresByEmail, (current) =>
            reserveInWindow(current, normalizeEmail(email), now, maxTrackedKeys, failureLimit),
          )
        }),
      releaseAttempt: (email, reservedAt) =>
        Ref.update(failuresByEmail, (current) =>
          releaseFromWindow(current, normalizeEmail(email), reservedAt),
        ),
      clear: (email) =>
        Ref.update(failuresByEmail, (current) => {
          const next = new Map(current)
          next.delete(normalizeEmail(email))
          return next
        }),
      withVerificationSlot: <A, E, R>(
        clientIp: string,
        effect: Effect.Effect<A, E, R>,
      ): Effect.Effect<A, E | VerificationQueueFull | ClientVerificationBusy, R> =>
        Effect.acquireUseRelease(
          admitVerification(clientIp),
          (admission): Effect.Effect<A, E | VerificationQueueFull | ClientVerificationBusy, R> => {
            if (admission === "client-busy") return Effect.fail(new ClientVerificationBusy())
            if (admission === "queue-full") return Effect.fail(new VerificationQueueFull())
            // scrypt keeps running on the threadpool after an interruption, so the permit must be held
            // until it finishes or aborted requests would bypass the concurrency cap.
            return semaphore.withPermits(1)(Effect.uninterruptible(effect))
          },
          releaseVerification(clientIp),
        ),
    })
  })

export const LoginAttemptsLive = Layer.effect(LoginAttempts, makeLoginAttempts())
