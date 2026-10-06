import { expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Queue, Result } from "effect"
import { TestClock } from "effect/testing"
import {
  ClientVerificationBusy,
  LoginAttempts,
  LoginAttemptsLive,
  makeLoginAttempts,
  VerificationQueueFull,
} from "./login-attempts.ts"

const email = "demo@crm-core.dev"
const client = "203.0.113.1"
const clients = ["203.0.113.1", "203.0.113.2", "203.0.113.3", "203.0.113.4"]

const reserve = (
  attempts: LoginAttempts["Service"],
  address: string,
  count: number,
  clientIp = client,
) =>
  Effect.forEach(Array.from({ length: count }), () => attempts.reserveAttempt(address, clientIp), {
    discard: true,
  })

it.effect("allows attempts until the fifth reservation", () =>
  Effect.gen(function* () {
    const attempts = yield* LoginAttempts
    yield* reserve(attempts, email, 4)
    expect(Result.isSuccess(yield* attempts.reserveAttempt(email, client))).toBe(true)
    expect(yield* attempts.reserveAttempt(email, client)).toEqual(Result.fail(900))
  }).pipe(Effect.provide(LoginAttemptsLive)),
)

it.effect("normalizes the email used as key", () =>
  Effect.gen(function* () {
    const attempts = yield* LoginAttempts
    yield* reserve(attempts, " Demo@CRM-core.dev ", 5)
    expect(Result.isFailure(yield* attempts.reserveAttempt(email, client))).toBe(true)
  }).pipe(Effect.provide(LoginAttemptsLive)),
)

it.effect("frees the account as failures leave the sliding window", () =>
  Effect.gen(function* () {
    const attempts = yield* LoginAttempts
    yield* reserve(attempts, email, 5)
    yield* TestClock.adjust("10 minutes")
    expect(yield* attempts.reserveAttempt(email, client)).toEqual(Result.fail(300))
    yield* TestClock.adjust("5 minutes")
    expect(Result.isSuccess(yield* attempts.reserveAttempt(email, client))).toBe(true)
  }).pipe(Effect.provide(LoginAttemptsLive)),
)

it.effect("rounds retryAfterSeconds up to whole seconds, at least 1", () =>
  Effect.gen(function* () {
    const attempts = yield* LoginAttempts
    yield* reserve(attempts, email, 5)
    yield* TestClock.adjust("899500 millis")
    expect(yield* attempts.reserveAttempt(email, client)).toEqual(Result.fail(1))
    yield* TestClock.adjust("-400 millis")
    expect(yield* attempts.reserveAttempt(email, client)).toEqual(Result.fail(1))
  }).pipe(Effect.provide(LoginAttemptsLive)),
)

it.effect("clear resets the failure count", () =>
  Effect.gen(function* () {
    const attempts = yield* LoginAttempts
    yield* reserve(attempts, email, 4)
    yield* attempts.clear(email, client)
    yield* reserve(attempts, email, 4)
    expect(Result.isSuccess(yield* attempts.reserveAttempt(email, client))).toBe(true)
  }).pipe(Effect.provide(LoginAttemptsLive)),
)

it.effect("limits each email independently", () =>
  Effect.gen(function* () {
    const attempts = yield* LoginAttempts
    yield* reserve(attempts, email, 5)
    expect(Result.isSuccess(yield* attempts.reserveAttempt("ana.souza@crm-core.dev", client))).toBe(
      true,
    )
  }).pipe(Effect.provide(LoginAttemptsLive)),
)

it.effect("release removes only the reserved timestamp", () =>
  Effect.gen(function* () {
    const attempts = yield* LoginAttempts
    const first = yield* attempts.reserveAttempt(email, client)
    yield* TestClock.adjust("1 minute")
    yield* reserve(attempts, email, 3)
    const last = yield* attempts.reserveAttempt(email, client)
    if (!Result.isSuccess(first) || !Result.isSuccess(last)) return expect.unreachable()
    yield* attempts.releaseAttempt(email, client, last.success)
    expect(Result.isSuccess(yield* attempts.reserveAttempt(email, client))).toBe(true)
    expect(yield* attempts.reserveAttempt(email, client)).toEqual(Result.fail(840))
    yield* attempts.releaseAttempt(email, client, first.success)
    expect(Result.isSuccess(yield* attempts.reserveAttempt(email, client))).toBe(true)
    expect(Result.isFailure(yield* attempts.reserveAttempt(email, client))).toBe(true)
  }).pipe(Effect.provide(LoginAttemptsLive)),
)

const isLimited = (attempts: LoginAttempts["Service"], address: string) =>
  Effect.map(attempts.reserveAttempt(address, client), Result.isFailure)

it.effect("never evicts a limited key, even when flooded with new emails", () =>
  Effect.gen(function* () {
    const attempts = yield* makeLoginAttempts({ maxTrackedKeys: 3 })
    yield* reserve(attempts, email, 5)
    yield* Effect.forEach(
      Array.from({ length: 50 }, (_, index) => `flood-${index}@crm-core.dev`),
      (address) => attempts.reserveAttempt(address, client),
      { discard: true },
    )
    expect(yield* isLimited(attempts, email)).toBe(true)
  }),
)

it.effect("evicts the oldest key that is not limited", () =>
  Effect.gen(function* () {
    const attempts = yield* makeLoginAttempts({ maxTrackedKeys: 3 })
    yield* reserve(attempts, "limited@crm-core.dev", 5)
    yield* reserve(attempts, "oldest@crm-core.dev", 4)
    yield* reserve(attempts, "newer@crm-core.dev", 1)
    yield* reserve(attempts, "new@crm-core.dev", 1)
    expect(yield* isLimited(attempts, "limited@crm-core.dev")).toBe(true)
    yield* reserve(attempts, "oldest@crm-core.dev", 4)
    expect(yield* isLimited(attempts, "oldest@crm-core.dev")).toBe(false)
  }),
)

// startImmediately runs each fiber up to its first suspension, so every call is admitted (running or
// waiting for a permit) before forkChild returns; the queue signals the two that hold permits.
const fillVerificationQueue = (attempts: LoginAttempts["Service"], gate: Deferred.Deferred<void>) =>
  Effect.gen(function* () {
    const running = yield* Queue.unbounded<void>()
    const fibers = yield* Effect.forEach(Array.from({ length: 22 }), (_, index) =>
      Effect.forkChild(
        attempts.withVerificationSlot(
          `client-${index}`,
          Queue.offer(running, undefined).pipe(Effect.andThen(Deferred.await(gate))),
        ),
        { startImmediately: true },
      ),
    )
    yield* Queue.take(running)
    yield* Queue.take(running)
    return fibers
  })

it.effect("rejects verifications beyond the running and waiting capacity", () =>
  Effect.gen(function* () {
    const attempts = yield* LoginAttempts
    const gate = yield* Deferred.make<void>()
    const fibers = yield* fillVerificationQueue(attempts, gate)
    const overflow = yield* Effect.flip(attempts.withVerificationSlot(client, Effect.void))
    expect(overflow).toBeInstanceOf(VerificationQueueFull)
    yield* Deferred.succeed(gate, undefined)
    yield* Effect.forEach(fibers, Fiber.join, { discard: true })
    yield* attempts.withVerificationSlot(client, Effect.void)
  }).pipe(Effect.provide(LoginAttemptsLive)),
)

it.effect("frees the slots of interrupted waiting verifications", () =>
  Effect.gen(function* () {
    const attempts = yield* LoginAttempts
    const gate = yield* Deferred.make<void>()
    const fibers = yield* fillVerificationQueue(attempts, gate)
    yield* Effect.forEach(fibers.slice(2), Fiber.interrupt, { discard: true })
    const probe = yield* Effect.forkChild(attempts.withVerificationSlot(client, Effect.void), {
      startImmediately: true,
    })
    yield* Deferred.succeed(gate, undefined)
    yield* Fiber.join(probe)
  }).pipe(Effect.provide(LoginAttemptsLive)),
)

it.effect("keeps the slot of an interrupted verification until it completes", () =>
  Effect.gen(function* () {
    const attempts = yield* LoginAttempts
    const gate = yield* Deferred.make<void>()
    const fibers = yield* fillVerificationQueue(attempts, gate)
    const [holder] = fibers
    if (holder === undefined) return expect.unreachable()
    const interruption = yield* Effect.forkChild(Fiber.interrupt(holder), {
      startImmediately: true,
    })
    expect(yield* Effect.flip(attempts.withVerificationSlot(client, Effect.void))).toBeInstanceOf(
      VerificationQueueFull,
    )
    yield* Deferred.succeed(gate, undefined)
    yield* Fiber.join(interruption)
    yield* attempts.withVerificationSlot(client, Effect.void)
  }).pipe(Effect.provide(LoginAttemptsLive)),
)

it.effect("caps parallel verifications per client and leaves room for others", () =>
  Effect.gen(function* () {
    const attempts = yield* LoginAttempts
    const gate = yield* Deferred.make<void>()
    const running = yield* Queue.unbounded<void>()
    const hold = attempts.withVerificationSlot(
      client,
      Queue.offer(running, undefined).pipe(Effect.andThen(Deferred.await(gate))),
    )
    const holders = yield* Effect.forEach(Array.from({ length: 2 }), () =>
      Effect.forkChild(hold, { startImmediately: true }),
    )
    yield* Queue.take(running)
    yield* Queue.take(running)
    expect(yield* Effect.flip(attempts.withVerificationSlot(client, Effect.void))).toBeInstanceOf(
      ClientVerificationBusy,
    )
    const otherClient = yield* Effect.forkChild(
      attempts.withVerificationSlot("203.0.113.2", Effect.void),
      { startImmediately: true },
    )
    yield* Deferred.succeed(gate, undefined)
    yield* Fiber.join(otherClient)
    yield* Effect.forEach(holders, Fiber.join, { discard: true })
    yield* attempts.withVerificationSlot(client, Effect.void)
  }).pipe(Effect.provide(LoginAttemptsLive)),
)

const reserveAcrossClients = (
  attempts: LoginAttempts["Service"],
  perClient: number,
  address = email,
) =>
  Effect.forEach(clients, (clientIp) => reserve(attempts, address, perClient, clientIp), {
    discard: true,
  })

it.effect("locks an email for the failing client only", () =>
  Effect.gen(function* () {
    const attempts = yield* LoginAttempts
    yield* reserve(attempts, email, 5, "203.0.113.1")
    expect(Result.isFailure(yield* attempts.reserveAttempt(email, "203.0.113.1"))).toBe(true)
    expect(Result.isSuccess(yield* attempts.reserveAttempt(email, "203.0.113.2"))).toBe(true)
  }).pipe(Effect.provide(LoginAttemptsLive)),
)

it.effect("admits exactly five of ten parallel reservations for one email and client", () =>
  Effect.gen(function* () {
    const attempts = yield* LoginAttempts
    const results = yield* Effect.forEach(
      Array.from({ length: 10 }),
      () => attempts.reserveAttempt(email, client),
      { concurrency: "unbounded" },
    )
    expect(results.filter(Result.isSuccess)).toHaveLength(5)
  }).pipe(Effect.provide(LoginAttemptsLive)),
)

it.effect("locks an email for every client after 20 failures across clients", () =>
  Effect.gen(function* () {
    const attempts = yield* LoginAttempts
    yield* reserveAcrossClients(attempts, 5)
    expect(yield* attempts.reserveAttempt(email, "203.0.113.5")).toEqual(Result.fail(900))
    expect(
      Result.isSuccess(yield* attempts.reserveAttempt("ana@crm-core.dev", "203.0.113.5")),
    ).toBe(true)
  }).pipe(Effect.provide(LoginAttemptsLive)),
)

it.effect("clear resets both the email-and-client and the email counts", () =>
  Effect.gen(function* () {
    const attempts = yield* LoginAttempts
    yield* reserveAcrossClients(attempts, 5)
    yield* attempts.clear(email, "203.0.113.1")
    yield* reserve(attempts, email, 4, "203.0.113.1")
    expect(Result.isSuccess(yield* attempts.reserveAttempt(email, "203.0.113.1"))).toBe(true)
  }).pipe(Effect.provide(LoginAttemptsLive)),
)

it.effect("reserves both keys or neither", () =>
  Effect.gen(function* () {
    const attempts = yield* LoginAttempts
    yield* reserveAcrossClients(attempts, 5)
    yield* reserve(attempts, email, 10, "203.0.113.5")
    yield* attempts.clear(email, "203.0.113.1")
    yield* reserve(attempts, email, 4, "203.0.113.5")
    expect(Result.isSuccess(yield* attempts.reserveAttempt(email, "203.0.113.5"))).toBe(true)
  }).pipe(Effect.provide(LoginAttemptsLive)),
)

it.effect("release frees the per-email count as well", () =>
  Effect.gen(function* () {
    const attempts = yield* LoginAttempts
    yield* reserve(attempts, email, 5, "203.0.113.1")
    yield* reserve(attempts, email, 5, "203.0.113.2")
    yield* reserve(attempts, email, 5, "203.0.113.3")
    yield* reserve(attempts, email, 4, "203.0.113.4")
    const twentieth = yield* attempts.reserveAttempt(email, "203.0.113.5")
    if (!Result.isSuccess(twentieth)) return expect.unreachable()
    expect(Result.isFailure(yield* attempts.reserveAttempt(email, "203.0.113.6"))).toBe(true)
    yield* attempts.releaseAttempt(email, "203.0.113.5", twentieth.success)
    expect(Result.isSuccess(yield* attempts.reserveAttempt(email, "203.0.113.6"))).toBe(true)
  }).pipe(Effect.provide(LoginAttemptsLive)),
)

it.effect("lets a client that logged in skip the per-email limit, but not other clients", () =>
  Effect.gen(function* () {
    const attempts = yield* LoginAttempts
    yield* attempts.clear(email, "203.0.113.9")
    yield* reserveAcrossClients(attempts, 5)
    expect(Result.isFailure(yield* attempts.reserveAttempt(email, "203.0.113.5"))).toBe(true)
    expect(Result.isSuccess(yield* attempts.reserveAttempt(email, "203.0.113.9"))).toBe(true)
    yield* reserve(attempts, email, 4, "203.0.113.9")
    expect(Result.isFailure(yield* attempts.reserveAttempt(email, "203.0.113.9"))).toBe(true)
  }).pipe(Effect.provide(LoginAttemptsLive)),
)

it.effect("forgets a known client after 30 days", () =>
  Effect.gen(function* () {
    const attempts = yield* LoginAttempts
    yield* attempts.clear(email, "203.0.113.9")
    yield* TestClock.adjust("30 days")
    yield* TestClock.adjust("1 second")
    yield* reserveAcrossClients(attempts, 5)
    expect(Result.isFailure(yield* attempts.reserveAttempt(email, "203.0.113.9"))).toBe(true)
  }).pipe(Effect.provide(LoginAttemptsLive)),
)

const isLockedOut = (attempts: LoginAttempts["Service"], address: string, clientIp: string) =>
  Effect.gen(function* () {
    yield* reserveAcrossClients(attempts, 5, address)
    return Result.isFailure(yield* attempts.reserveAttempt(address, clientIp))
  })

it.effect("bounds the emails with known clients, forgetting the least recently seen", () =>
  Effect.gen(function* () {
    const attempts = yield* makeLoginAttempts({ maxTrackedKeys: 2 })
    for (const address of [email, "b@crm-core.dev", "c@crm-core.dev"])
      yield* attempts.clear(address, "203.0.113.9")
    expect(yield* isLockedOut(attempts, email, "203.0.113.9")).toBe(true)
    expect(yield* isLockedOut(attempts, "c@crm-core.dev", "203.0.113.9")).toBe(false)
  }),
)

it.effect("keeps only the five most recent known clients per email", () =>
  Effect.gen(function* () {
    const attempts = yield* LoginAttempts
    const known = Array.from({ length: 6 }, (_, index) => `203.0.113.${10 + index}`)
    for (const clientIp of known) yield* attempts.clear(email, clientIp)
    yield* reserveAcrossClients(attempts, 5)
    expect(Result.isFailure(yield* attempts.reserveAttempt(email, "203.0.113.10"))).toBe(true)
    expect(Result.isSuccess(yield* attempts.reserveAttempt(email, "203.0.113.15"))).toBe(true)
  }).pipe(Effect.provide(LoginAttemptsLive)),
)

it.effect("never lets one account push out another account's known clients", () =>
  Effect.gen(function* () {
    const attempts = yield* makeLoginAttempts({ maxTrackedKeys: 2 })
    yield* attempts.clear(email, "203.0.113.9")
    for (let index = 0; index < 50; index++)
      yield* attempts.clear("flood@crm-core.dev", `198.51.100.${index}`)
    expect(yield* isLockedOut(attempts, email, "203.0.113.9")).toBe(false)
  }),
)
