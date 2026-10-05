import { Seller } from "@crm/contract"
import { Context, Effect, Layer, Schema } from "effect"
import { SqlClient, type SqlError, SqlSchema } from "effect/unstable/sql"
import { dieOnSchemaError } from "#src/platform/schema-defects.ts"

const SellerRow = Schema.Struct({ id: Schema.String, name: Schema.String })
const IsSellerRow = Schema.Struct({ isSeller: Schema.Boolean })

export class SellersRepository extends Context.Service<
  SellersRepository,
  {
    readonly list: () => Effect.Effect<ReadonlyArray<Seller>, SqlError.SqlError>
    readonly isSeller: (id: string) => Effect.Effect<boolean, SqlError.SqlError>
  }
>()("crm/SellersRepository") {}

export const SellersRepositoryLive = Layer.effect(
  SellersRepository,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const list = SqlSchema.findAll({
      Request: Schema.Void,
      Result: SellerRow,
      execute: () => sql`SELECT id, name FROM users WHERE role = 'SELLER' ORDER BY name`,
    })

    const isSeller = SqlSchema.findOne({
      Request: Schema.String,
      Result: IsSellerRow,
      execute: (id) => sql`
        SELECT EXISTS (SELECT 1 FROM users WHERE id = ${id} AND role = 'SELLER') AS "isSeller"
      `,
    })

    return {
      list: () =>
        list().pipe(
          dieOnSchemaError,
          Effect.map((rows) => rows.map((row) => new Seller(row))),
        ),
      isSeller: (id) =>
        isSeller(id).pipe(
          Effect.catchTag("NoSuchElementError", (error) => Effect.die(error)),
          dieOnSchemaError,
          Effect.map((row) => row.isSeller),
        ),
    }
  }),
)
