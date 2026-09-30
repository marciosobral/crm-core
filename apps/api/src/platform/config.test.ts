import { expect, it } from "@effect/vitest"
import { ConfigProvider, Effect, Exit, Redacted } from "effect"
import { SeedConfig } from "./config.ts"

const parseSeedConfig = (values: Record<string, string>) =>
  Effect.exit(SeedConfig.parse(ConfigProvider.fromUnknown(values)))

const exampleDemoPassword = "demo-crm-1234"
const exampleSellerPassword = "seller-crm-1234"
const customDemoPassword = "custom-demo-password"
const customSellerPassword = "custom-seller-password"

it.effect("refuses the example seed passwords in production", () =>
  Effect.gen(function* () {
    for (const passwords of [
      { SEED_DEMO_PASSWORD: exampleDemoPassword, SEED_SELLER_PASSWORD: customSellerPassword },
      { SEED_DEMO_PASSWORD: customDemoPassword, SEED_SELLER_PASSWORD: exampleSellerPassword },
    ]) {
      const exit = yield* parseSeedConfig({ NODE_ENV: "production", ...passwords })
      expect(Exit.isFailure(exit)).toBe(true)
      const message = String(exit)
      expect(message).toContain("example")
      expect(message).not.toContain(exampleDemoPassword)
      expect(message).not.toContain(exampleSellerPassword)
    }
  }),
)

it.effect("accepts custom seed passwords in production", () =>
  Effect.gen(function* () {
    const exit = yield* parseSeedConfig({
      NODE_ENV: "production",
      SEED_DEMO_PASSWORD: customDemoPassword,
      SEED_SELLER_PASSWORD: customSellerPassword,
    })
    expect(Exit.isSuccess(exit) && Redacted.value(exit.value.demoPassword)).toBe(customDemoPassword)
  }),
)

it.effect("accepts the example seed passwords outside production", () =>
  Effect.gen(function* () {
    const exit = yield* parseSeedConfig({
      SEED_DEMO_PASSWORD: exampleDemoPassword,
      SEED_SELLER_PASSWORD: exampleSellerPassword,
    })
    expect(Exit.isSuccess(exit)).toBe(true)
  }),
)
