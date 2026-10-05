import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { hashPassword } from "#src/auth/password.ts"
import { SeedConfig } from "#src/platform/config.ts"

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const { demoPassword, sellerPassword } = yield* SeedConfig
  const sellers = [
    { name: "Conta Demo", email: "demo@crm-core.dev", password: demoPassword },
    { name: "Ana Souza", email: "ana.souza@crm-core.dev", password: sellerPassword },
    { name: "Bruno Lima", email: "bruno.lima@crm-core.dev", password: sellerPassword },
  ]
  const rows = yield* Effect.forEach(sellers, ({ name, email, password }) =>
    Effect.map(hashPassword(password), (passwordHash) => ({
      name,
      email,
      password_hash: passwordHash,
    })),
  )
  yield* sql`INSERT INTO users ${sql.insert(rows)}`
})
