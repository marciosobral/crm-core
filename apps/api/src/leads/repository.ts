import { Lead, LeadSource, Seller } from "@crm/contract"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { SqlClient, type SqlError, SqlSchema } from "effect/unstable/sql"
import { dieOnSchemaError } from "../platform/schema-defects.ts"

const LeadRow = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  company: Schema.String,
  email: Schema.String,
  phone: Schema.String,
  jobTitle: Schema.NullOr(Schema.String),
  source: LeadSource,
  notes: Schema.NullOr(Schema.String),
  createdAt: Schema.DateTimeUtcFromDate,
  sellerId: Schema.String,
  sellerName: Schema.String,
})

const toLead = (row: typeof LeadRow.Type) =>
  new Lead({
    id: row.id,
    name: row.name,
    company: row.company,
    email: row.email,
    phone: row.phone,
    jobTitle: row.jobTitle,
    source: row.source,
    notes: row.notes,
    createdAt: row.createdAt,
    seller: new Seller({ id: row.sellerId, name: row.sellerName }),
  })

const LeadScope = Schema.Struct({
  sellerId: Schema.optionalKey(Schema.String),
  search: Schema.optionalKey(Schema.String),
})

const NewLead = Schema.Struct({
  name: Schema.String,
  company: Schema.String,
  email: Schema.String,
  phone: Schema.String,
  jobTitle: Schema.NullOr(Schema.String),
  source: LeadSource,
  notes: Schema.NullOr(Schema.String),
  sellerId: Schema.String,
  createdBy: Schema.String,
})

const escapeLikePattern = (text: string) => text.replace(/[\\%_]/g, "\\$&")

export class LeadsRepository extends Context.Service<
  LeadsRepository,
  {
    readonly list: (
      scope: typeof LeadScope.Type,
    ) => Effect.Effect<ReadonlyArray<Lead>, SqlError.SqlError>
    readonly create: (lead: typeof NewLead.Type) => Effect.Effect<Lead, SqlError.SqlError>
  }
>()("crm/LeadsRepository") {}

export const LeadsRepositoryLive = Layer.effect(
  LeadsRepository,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const selectLeads = (condition: ReturnType<typeof sql.and>) => sql`
      SELECT l.id, l.name, l.company, l.email, l.phone, l.job_title AS "jobTitle", l.source, l.notes,
             l.created_at AS "createdAt", u.id AS "sellerId", u.name AS "sellerName"
      FROM leads l JOIN users u ON u.id = l.seller_id
      WHERE ${condition}
      ORDER BY l.created_at DESC, l.id
    `

    const list = SqlSchema.findAll({
      Request: LeadScope,
      Result: LeadRow,
      execute: ({ sellerId, search }) => {
        const conditions = [sql`TRUE`]
        if (sellerId !== undefined) conditions.push(sql`l.seller_id = ${sellerId}`)
        if (search !== undefined) {
          const pattern = `%${escapeLikePattern(search)}%`
          conditions.push(
            sql`(l.name ILIKE ${pattern} OR l.company ILIKE ${pattern} OR l.email ILIKE ${pattern})`,
          )
        }
        return selectLeads(sql.and(conditions))
      },
    })

    const findById = SqlSchema.findOneOption({
      Request: Schema.String,
      Result: LeadRow,
      execute: (id) => selectLeads(sql.and([sql`l.id = ${id}`])),
    })

    const insert = SqlSchema.findOne({
      Request: NewLead,
      Result: Schema.Struct({ id: Schema.String }),
      execute: (lead) => sql`
        INSERT INTO leads (name, company, email, phone, job_title, source, notes, seller_id, created_by)
        VALUES (${lead.name}, ${lead.company}, ${lead.email}, ${lead.phone}, ${lead.jobTitle},
                ${lead.source}, ${lead.notes}, ${lead.sellerId}, ${lead.createdBy})
        RETURNING id
      `,
    })

    return {
      list: (scope) =>
        list(scope).pipe(
          dieOnSchemaError,
          Effect.map((rows) => rows.map(toLead)),
        ),
      create: (lead) =>
        Effect.gen(function* () {
          const { id } = yield* insert(lead)
          const row = yield* findById(id)
          if (Option.isNone(row)) return yield* Effect.die(new Error("Inserted lead not found"))
          return toLead(row.value)
        }).pipe(
          Effect.catchTag("NoSuchElementError", (error) => Effect.die(error)),
          dieOnSchemaError,
        ),
    }
  }),
)
