import { Deal, DealLead, DealStatus, LostReason, OpenDealStatus, Seller } from "@crm/contract"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { SqlClient, type SqlError, SqlSchema } from "effect/unstable/sql"
import { dieOnSchemaError } from "../platform/schema-defects.ts"
import { escapeLikePattern } from "../platform/sql-like.ts"

const DealRow = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  valueCents: Schema.NumberFromString,
  status: DealStatus,
  expectedCloseDate: Schema.NullOr(Schema.String),
  description: Schema.NullOr(Schema.String),
  createdAt: Schema.DateTimeUtcFromDate,
  lostReason: Schema.NullOr(LostReason),
  lostNote: Schema.NullOr(Schema.String),
  closedAt: Schema.NullOr(Schema.DateTimeUtcFromDate),
  leadId: Schema.String,
  leadName: Schema.String,
  leadCompany: Schema.String,
  sellerId: Schema.String,
  sellerName: Schema.String,
})

const toDeal = (row: typeof DealRow.Type) =>
  new Deal({
    id: row.id,
    title: row.title,
    valueCents: row.valueCents,
    status: row.status,
    expectedCloseDate: row.expectedCloseDate,
    description: row.description,
    createdAt: row.createdAt,
    lostReason: row.lostReason,
    lostNote: row.lostNote,
    closedAt: row.closedAt,
    lead: new DealLead({ id: row.leadId, name: row.leadName, company: row.leadCompany }),
    seller: new Seller({ id: row.sellerId, name: row.sellerName }),
  })

const DealScope = Schema.Struct({
  sellerId: Schema.optionalKey(Schema.String),
  search: Schema.optionalKey(Schema.String),
})

const NewDeal = Schema.Struct({
  title: Schema.String,
  valueCents: Schema.Number,
  status: OpenDealStatus,
  expectedCloseDate: Schema.NullOr(Schema.String),
  description: Schema.NullOr(Schema.String),
  leadId: Schema.String,
  sellerId: Schema.String,
  createdBy: Schema.String,
})

const DealClosing = Schema.Union([
  Schema.Struct({ status: Schema.Literal("WON") }),
  Schema.Struct({
    status: Schema.Literal("LOST"),
    lostReason: LostReason,
    lostNote: Schema.NullOr(Schema.String),
  }),
])

export class DealsRepository extends Context.Service<
  DealsRepository,
  {
    readonly list: (
      scope: typeof DealScope.Type,
    ) => Effect.Effect<ReadonlyArray<Deal>, SqlError.SqlError>
    readonly findById: (
      id: string,
      scope: { readonly sellerId?: string },
    ) => Effect.Effect<Option.Option<Deal>, SqlError.SqlError>
    readonly findLeadSellerId: (
      leadId: string,
    ) => Effect.Effect<Option.Option<string>, SqlError.SqlError>
    readonly create: (deal: typeof NewDeal.Type) => Effect.Effect<Deal, SqlError.SqlError>
    readonly moveOpen: (
      id: string,
      status: OpenDealStatus,
    ) => Effect.Effect<Option.Option<Deal>, SqlError.SqlError>
    readonly close: (
      id: string,
      closing: typeof DealClosing.Type,
    ) => Effect.Effect<Option.Option<Deal>, SqlError.SqlError>
  }
>()("crm/DealsRepository") {}

export const DealsRepositoryLive = Layer.effect(
  DealsRepository,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    // int8 arrives as a string from pg, and a date column would become a local-midnight JS Date,
    // so both are converted to text in SQL and decoded explicitly.
    const selectDeals = (condition: ReturnType<typeof sql.and>) => sql`
      SELECT d.id, d.title, d.value_cents::text AS "valueCents", d.status,
             to_char(d.expected_close_date, 'YYYY-MM-DD') AS "expectedCloseDate",
             d.description, d.created_at AS "createdAt",
             d.lost_reason AS "lostReason", d.lost_note AS "lostNote", d.closed_at AS "closedAt",
             l.id AS "leadId", l.name AS "leadName", l.company AS "leadCompany",
             u.id AS "sellerId", u.name AS "sellerName"
      FROM deals d
      JOIN leads l ON l.id = d.lead_id
      JOIN users u ON u.id = d.seller_id
      WHERE ${condition}
      ORDER BY d.created_at DESC, d.id
    `

    const list = SqlSchema.findAll({
      Request: DealScope,
      Result: DealRow,
      execute: ({ sellerId, search }) => {
        const conditions = [sql`TRUE`]
        if (sellerId !== undefined) conditions.push(sql`d.seller_id = ${sellerId}`)
        if (search !== undefined) {
          const pattern = `%${escapeLikePattern(search)}%`
          conditions.push(
            sql`(d.title ILIKE ${pattern} OR l.name ILIKE ${pattern} OR l.company ILIKE ${pattern})`,
          )
        }
        return selectDeals(sql.and(conditions))
      },
    })

    const findById = SqlSchema.findOneOption({
      Request: Schema.Struct({ id: Schema.String, sellerId: Schema.optionalKey(Schema.String) }),
      Result: DealRow,
      execute: ({ id, sellerId }) =>
        selectDeals(
          sql.and(
            sellerId === undefined
              ? [sql`d.id = ${id}`]
              : [sql`d.id = ${id}`, sql`d.seller_id = ${sellerId}`],
          ),
        ),
    })

    const findLeadSellerId = SqlSchema.findOneOption({
      Request: Schema.String,
      Result: Schema.Struct({ sellerId: Schema.String }),
      execute: (leadId) => sql`SELECT seller_id AS "sellerId" FROM leads WHERE id = ${leadId}`,
    })

    const insert = SqlSchema.findOne({
      Request: NewDeal,
      Result: Schema.Struct({ id: Schema.String }),
      execute: (deal) => sql`
        INSERT INTO deals (title, value_cents, status, expected_close_date, description, lead_id, seller_id, created_by)
        VALUES (${deal.title}, ${deal.valueCents}, ${deal.status}, ${deal.expectedCloseDate},
                ${deal.description}, ${deal.leadId}, ${deal.sellerId}, ${deal.createdBy})
        RETURNING id
      `,
    })

    // The open-status guard lives in the UPDATE so a deal closed concurrently is never reopened.
    const updateOpenStatus = SqlSchema.findOneOption({
      Request: Schema.Struct({ id: Schema.String, status: OpenDealStatus }),
      Result: Schema.Struct({ id: Schema.String }),
      execute: ({ id, status }) => sql`
        UPDATE deals SET status = ${status}, updated_at = now()
        WHERE id = ${id} AND status NOT IN ('WON', 'LOST')
        RETURNING id
      `,
    })

    const updateClosing = SqlSchema.findOneOption({
      Request: Schema.Struct({ id: Schema.String, closing: DealClosing }),
      Result: Schema.Struct({ id: Schema.String }),
      execute: ({ id, closing }) => sql`
        UPDATE deals
        SET status = ${closing.status},
            lost_reason = ${closing.status === "LOST" ? closing.lostReason : null},
            lost_note = ${closing.status === "LOST" ? closing.lostNote : null},
            closed_at = now(), updated_at = now()
        WHERE id = ${id} AND status NOT IN ('WON', 'LOST')
        RETURNING id
      `,
    })

    const readBack = (id: string) =>
      Effect.flatMap(findById({ id }), (row) =>
        Option.isNone(row)
          ? Effect.die(new Error("Written deal not found"))
          : Effect.succeed(toDeal(row.value)),
      )

    return {
      list: (scope) =>
        list(scope).pipe(
          dieOnSchemaError,
          Effect.map((rows) => rows.map(toDeal)),
        ),
      findById: (id, scope) =>
        findById({ id, ...scope }).pipe(dieOnSchemaError, Effect.map(Option.map(toDeal))),
      findLeadSellerId: (leadId) =>
        findLeadSellerId(leadId).pipe(
          dieOnSchemaError,
          Effect.map(Option.map((row) => row.sellerId)),
        ),
      create: (deal) =>
        Effect.gen(function* () {
          const { id } = yield* insert(deal)
          return yield* readBack(id)
        }).pipe(
          Effect.catchTag("NoSuchElementError", (error) => Effect.die(error)),
          dieOnSchemaError,
        ),
      moveOpen: (id, status) =>
        Effect.gen(function* () {
          const updated = yield* updateOpenStatus({ id, status })
          if (Option.isNone(updated)) return Option.none()
          return Option.some(yield* readBack(id))
        }).pipe(dieOnSchemaError),
      close: (id, closing) =>
        Effect.gen(function* () {
          const updated = yield* updateClosing({ id, closing })
          if (Option.isNone(updated)) return Option.none()
          return Option.some(yield* readBack(id))
        }).pipe(dieOnSchemaError),
    }
  }),
)
