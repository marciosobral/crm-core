import { Config } from "effect"

export const ServerConfig = Config.all({
  port: Config.Port("PORT").pipe(Config.withDefault(3001)),
  corsOrigin: Config.String("CORS_ORIGIN").pipe(Config.withDefault("http://localhost:5173")),
})

export const DatabaseConfig = Config.all({
  usePglite: Config.Boolean("DATABASE_PGLITE").pipe(Config.withDefault(false)),
  pgliteDataDir: Config.String("PGLITE_DATA_DIR").pipe(Config.option),
})
