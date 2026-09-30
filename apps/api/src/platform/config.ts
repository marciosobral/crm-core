import { Config, ConfigProvider, Effect, Redacted, Schema } from "effect"

export const ServerConfig = Config.all({
  port: Config.Port("PORT").pipe(Config.withDefault(3001)),
  corsOrigin: Config.String("CORS_ORIGIN").pipe(Config.withDefault("http://localhost:5173")),
})

export const DatabaseConfig = Config.all({
  usePglite: Config.Boolean("DATABASE_PGLITE").pipe(Config.withDefault(false)),
  pgliteDataDir: Config.String("PGLITE_DATA_DIR").pipe(Config.option),
})

const SeedPassword = Schema.Redacted(Schema.String.check(Schema.isMinLength(12)))

const exampleSeedPasswords = ["demo-crm-1234", "seller-crm-1234"]

export const SeedConfig = Config.all({
  nodeEnv: Config.schema(Schema.Literals(["development", "test", "production"]), "NODE_ENV").pipe(
    Config.withDefault("development"),
  ),
  demoPassword: Config.schema(SeedPassword, "SEED_DEMO_PASSWORD"),
  sellerPassword: Config.schema(SeedPassword, "SEED_SELLER_PASSWORD"),
}).pipe(
  Config.mapEffect(({ nodeEnv, demoPassword, sellerPassword }) =>
    nodeEnv === "production" &&
    [demoPassword, sellerPassword].some((password) =>
      exampleSeedPasswords.includes(Redacted.value(password)),
    )
      ? Effect.fail(
          new Config.ConfigError(
            new ConfigProvider.SourceError({
              message:
                "SEED_DEMO_PASSWORD and SEED_SELLER_PASSWORD must not use the public example values in production",
            }),
          ),
        )
      : Effect.succeed({ demoPassword, sellerPassword }),
  ),
)
