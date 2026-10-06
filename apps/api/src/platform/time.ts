import { DateTime, Effect } from "effect"

// The zone is read once, when the handler or layer is built, so each call only reads the clock.
export const businessTime = Effect.gen(function* () {
  const zone = yield* DateTime.CurrentTimeZone
  const businessNow = Effect.map(DateTime.now, (now) => DateTime.setZone(now, zone))
  const businessToday = Effect.map(businessNow, DateTime.formatIsoDate)
  return { businessNow, businessToday }
})
