import { DealStatus, Lead, LeadLastActivity, LeadSource, Seller } from "@crm/contract"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { SqlClient, type SqlError, SqlSchema } from "effect/unstable/sql"
import { dieOnMissingRow, dieOnSchemaError, escapeLikePattern } from "#src/platform/sql.ts"

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
  status: DealStatus,
  lastActivityAt: Schema.NullOr(Schema.DateTimeUtcFromDate),
  lastActivityAuthorName: Schema.NullOr(Schema.String),
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
    status: row.status,
    lastActivity:
      row.lastActivityAt === null || row.lastActivityAuthorName === null
        ? null
        : new LeadLastActivity({ at: row.lastActivityAt, authorName: row.lastActivityAuthorName }),
  })

const LeadScope = Schema.Struct({
  sellerId: Schema.optionalKey(Schema.String),
  search: Schema.optionalKey(Schema.String),
  status: Schema.optionalKey(DealStatus),
  activitySellerId: Schema.optionalKey(Schema.String),
})

const ActivityScope = Schema.Struct({
  activitySellerId: Schema.optionalKey(Schema.String),
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

export class LeadsRepository extends Context.Service<
  LeadsRepository,
  {
    readonly list: (
      scope: typeof LeadScope.Type,
    ) => Effect.Effect<ReadonlyArray<Lead>, SqlError.SqlError>
    readonly summarize: (
      scope: typeof LeadScope.Type,
      limit: number,
    ) => Effect.Effect<
      { readonly count: number; readonly sample: ReadonlyArray<Lead> },
      SqlError.SqlError
    >
    readonly countBySeller: () => Effect.Effect<
      ReadonlyArray<{
        readonly sellerId: string
        readonly sellerName: string
        readonly count: number
      }>,
      SqlError.SqlError
    >
    readonly exists: (scope: {
      readonly sellerId?: string
    }) => Effect.Effect<boolean, SqlError.SqlError>
    readonly findById: (
      id: string,
      activityScope?: typeof ActivityScope.Type,
    ) => Effect.Effect<Option.Option<Lead>, SqlError.SqlError>
    readonly create: (lead: typeof NewLead.Type) => Effect.Effect<Lead, SqlError.SqlError>
  }
>()("crm/LeadsRepository") {}

export const LeadsRepositoryLive = Layer.effect(
  LeadsRepository,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    // A lead has no stored status: it shows its most advanced open deal, else WON if any deal was won, else LOST, and NEW when it has no deals.
    const dealStatusLateral = sql`
      LEFT JOIN LATERAL (
        SELECT CASE
          WHEN count(*) = 0 THEN 'NEW'
          WHEN bool_or(d.status NOT IN ('WON', 'LOST')) THEN
            (ARRAY['NEW', 'CONTACTED', 'PROPOSAL_SENT', 'NEGOTIATION'])[
              max(array_position(ARRAY['NEW', 'CONTACTED', 'PROPOSAL_SENT', 'NEGOTIATION'], d.status))
            ]
          WHEN bool_or(d.status = 'WON') THEN 'WON'
          ELSE 'LOST'
        END AS status
        FROM deals d
        WHERE d.lead_id = l.id
      ) ds ON TRUE
    `

    const selectLeads = (
      condition: ReturnType<typeof sql.and>,
      activitySellerId: string | undefined,
      limit = sql``,
    ) => {
      const activityDeals =
        activitySellerId === undefined ? sql`TRUE` : sql`d.seller_id = ${activitySellerId}`
      return sql`
      SELECT l.id, l.name, l.company, l.email, l.phone, l.job_title AS "jobTitle", l.source, l.notes,
             l.created_at AS "createdAt", u.id AS "sellerId", u.name AS "sellerName", ds.status,
             la.created_at AS "lastActivityAt", la.author_name AS "lastActivityAuthorName"
      FROM leads l
      JOIN users u ON u.id = l.seller_id
      ${dealStatusLateral}
      LEFT JOIN LATERAL (
        SELECT activity.created_at, u2.name AS author_name
        FROM (
          SELECT c.created_at, c.seq, c.author_id AS user_id
          FROM deal_comments c JOIN deals d ON d.id = c.deal_id
          WHERE d.lead_id = l.id AND ${activityDeals}
          UNION ALL
          SELECT e.created_at, e.seq, e.actor_id
          FROM deal_events e JOIN deals d ON d.id = e.deal_id
          WHERE d.lead_id = l.id AND ${activityDeals}
        ) activity
        JOIN users u2 ON u2.id = activity.user_id
        ORDER BY activity.created_at DESC, activity.seq DESC
        LIMIT 1
      ) la ON TRUE
      WHERE ${condition}
      ORDER BY l.created_at DESC, l.id
      ${limit}
    `
    }

    const leadConditions = ({ sellerId, search, status }: typeof LeadScope.Type) => {
      const conditions = [sql`TRUE`]
      if (sellerId !== undefined) conditions.push(sql`l.seller_id = ${sellerId}`)
      if (search !== undefined) {
        const pattern = `%${escapeLikePattern(search)}%`
        conditions.push(
          sql`(l.name ILIKE ${pattern} OR l.company ILIKE ${pattern} OR l.email ILIKE ${pattern})`,
        )
      }
      if (status !== undefined) conditions.push(sql`ds.status = ${status}`)
      return sql.and(conditions)
    }

    const list = SqlSchema.findAll({
      Request: LeadScope,
      Result: LeadRow,
      execute: (scope) => selectLeads(leadConditions(scope), scope.activitySellerId),
    })

    const sample = SqlSchema.findAll({
      Request: Schema.Struct({ ...LeadScope.fields, limit: Schema.Number }),
      Result: LeadRow,
      execute: ({ limit, ...scope }) =>
        selectLeads(leadConditions(scope), scope.activitySellerId, sql`LIMIT ${limit}`),
    })

    // The deal-status lateral is joined only when filtering by status, so plain counts skip it.
    const count = SqlSchema.findOne({
      Request: LeadScope,
      Result: Schema.Struct({ count: Schema.Number }),
      execute: (scope) => sql`
        SELECT count(*)::int AS count
        FROM leads l
        ${scope.status === undefined ? sql`` : dealStatusLateral}
        WHERE ${leadConditions(scope)}
      `,
    })

    const countBySeller = SqlSchema.findAll({
      Request: Schema.Void,
      Result: Schema.Struct({
        sellerId: Schema.String,
        sellerName: Schema.String,
        count: Schema.Number,
      }),
      execute: () => sql`
        SELECT u.id AS "sellerId", u.name AS "sellerName", count(l.id)::int AS count
        FROM users u
        LEFT JOIN leads l ON l.seller_id = u.id
        WHERE u.role = 'SELLER'
        GROUP BY u.id, u.name
        ORDER BY u.name
      `,
    })

    const exists = SqlSchema.findOne({
      Request: Schema.Struct({ sellerId: Schema.optionalKey(Schema.String) }),
      Result: Schema.Struct({ found: Schema.Boolean }),
      execute: ({ sellerId }) => sql`
        SELECT EXISTS (
          SELECT 1 FROM leads l WHERE ${sellerId === undefined ? sql`TRUE` : sql`l.seller_id = ${sellerId}`}
        ) AS found
      `,
    })

    const findLeadRow = SqlSchema.findOneOption({
      Request: Schema.Struct({ id: Schema.String, ...ActivityScope.fields }),
      Result: LeadRow,
      execute: ({ id, activitySellerId }) =>
        selectLeads(sql.and([sql`l.id = ${id}`]), activitySellerId),
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
      summarize: (scope, limit) =>
        Effect.all({
          matching: count(scope).pipe(dieOnMissingRow),
          rows: sample({ ...scope, limit }),
        }).pipe(
          dieOnSchemaError,
          Effect.map(({ matching, rows }) => ({ count: matching.count, sample: rows.map(toLead) })),
        ),
      countBySeller: () => countBySeller().pipe(dieOnSchemaError),
      exists: (scope) =>
        exists(scope).pipe(
          dieOnMissingRow,
          dieOnSchemaError,
          Effect.map((row) => row.found),
        ),
      findById: (id, activityScope = {}) =>
        findLeadRow({ id, ...activityScope }).pipe(
          dieOnSchemaError,
          Effect.map(Option.map(toLead)),
        ),
      create: (lead) =>
        Effect.gen(function* () {
          const { id } = yield* insert(lead)
          const row = yield* findLeadRow({ id })
          if (Option.isNone(row)) return yield* Effect.die(new Error("Inserted lead not found"))
          return toLead(row.value)
        }).pipe(dieOnMissingRow, dieOnSchemaError),
    }
  }),
)
