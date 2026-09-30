import { CurrentUser, User } from "@crm/contract"
import { expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { HttpApiError } from "effect/unstable/httpapi"
import { requirePermission } from "./permissions.ts"

const seller = new User({
  id: "1",
  name: "Ana",
  email: "ana@example.com",
  role: "SELLER",
  permissions: ["lead.create"],
})
const supervisor = new User({
  id: "2",
  name: "Demo",
  email: "demo@example.com",
  role: "SUPERVISOR",
  permissions: ["lead.create", "lead.see_all", "lead.assign_any"],
})

it.effect("fails with Forbidden when the current user lacks the permission", () =>
  Effect.gen(function* () {
    const error = yield* requirePermission("lead.see_all").pipe(
      Effect.provideService(CurrentUser, seller),
      Effect.flip,
    )
    expect(error).toBeInstanceOf(HttpApiError.Forbidden)
  }),
)

it.effect("returns the current user when it has the permission", () =>
  Effect.gen(function* () {
    const user = yield* requirePermission("lead.see_all").pipe(
      Effect.provideService(CurrentUser, supervisor),
    )
    expect(user).toBe(supervisor)
  }),
)
