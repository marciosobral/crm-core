import { PgliteClient } from "@effect/sql-pglite"
import { ConfigProvider, Layer } from "effect"
import { MigrationsLive } from "../platform/migrations/index.ts"

export const demoPassword = "demo-test-password"

export const TestDatabase = MigrationsLive.pipe(
  Layer.provideMerge(PgliteClient.layer()),
  Layer.provide(
    ConfigProvider.layer(
      ConfigProvider.fromUnknown({
        SEED_DEMO_PASSWORD: demoPassword,
        SEED_SELLER_PASSWORD: "seller-test-password",
      }),
    ),
  ),
)
