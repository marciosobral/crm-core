import {
  Deal,
  type DealActivity,
  type DealComment,
  DealLead,
  DealStatus,
  LostReason,
  OpenDealStatus,
  Seller,
} from "@crm/contract"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { SqlClient, type SqlError, SqlSchema } from "effect/unstable/sql"
import { dieOnMissingRow, dieOnSchemaError, escapeLikePattern } from "#src/platform/sql.ts"

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

const NewDealEvent = Schema.Struct({
  dealId: Schema.String,
  actorId: Schema.String,
  type: Schema.Literals(["CREATED", "SELLER_ASSIGNED", "STATUS_CHANGED", "WON", "LOST"]),
  status: Schema.NullOr(OpenDealStatus),
  lostReason: Schema.NullOr(LostReason),
  sellerId: Schema.NullOr(Schema.String),
})

const NewDealComment = Schema.Struct({
  dealId: Schema.String,
  authorId: Schema.String,
  body: Schema.String,
})

const activityRowFields = {
  id: Schema.String,
  authorId: Schema.String,
  authorName: Schema.String,
  createdAt: Schema.DateTimeUtcFromDate,
}

const CommentRow = Schema.Struct({
  ...activityRowFields,
  kind: Schema.Literal("COMMENT"),
  body: Schema.String,
})

const ActivityRow = Schema.Union([
  CommentRow,
  Schema.Struct({ ...activityRowFields, kind: Schema.Literals(["CREATED", "WON"]) }),
  Schema.Struct({
    ...activityRowFields,
    kind: Schema.Literal("SELLER_ASSIGNED"),
    sellerId: Schema.String,
    sellerName: Schema.String,
  }),
  Schema.Struct({
    ...activityRowFields,
    kind: Schema.Literal("STATUS_CHANGED"),
    status: OpenDealStatus,
  }),
  Schema.Struct({ ...activityRowFields, kind: Schema.Literal("LOST"), lostReason: LostReason }),
])

const toComment = (row: typeof CommentRow.Type): DealComment => ({
  kind: "COMMENT",
  id: row.id,
  author: new Seller({ id: row.authorId, name: row.authorName }),
  createdAt: row.createdAt,
  body: row.body,
})

const toActivity = (row: typeof ActivityRow.Type): DealActivity => {
  const base = {
    id: row.id,
    author: new Seller({ id: row.authorId, name: row.authorName }),
    createdAt: row.createdAt,
  }
  switch (row.kind) {
    case "COMMENT":
      return toComment(row)
    case "CREATED":
      return { ...base, kind: "CREATED" }
    case "WON":
      return { ...base, kind: "WON" }
    case "SELLER_ASSIGNED":
      return {
        ...base,
        kind: "SELLER_ASSIGNED",
        seller: new Seller({ id: row.sellerId, name: row.sellerName }),
      }
    case "STATUS_CHANGED":
      return { ...base, kind: "STATUS_CHANGED", status: row.status }
    case "LOST":
      return { ...base, kind: "LOST", lostReason: row.lostReason }
  }
}

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
      actorId: string,
    ) => Effect.Effect<Option.Option<Deal>, SqlError.SqlError>
    readonly close: (
      id: string,
      closing: typeof DealClosing.Type,
      actorId: string,
    ) => Effect.Effect<Option.Option<Deal>, SqlError.SqlError>
    readonly listActivities: (
      dealId: string,
    ) => Effect.Effect<ReadonlyArray<DealActivity>, SqlError.SqlError>
    readonly addComment: (
      comment: typeof NewDealComment.Type,
    ) => Effect.Effect<DealComment, SqlError.SqlError>
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

    // The open-status guard and the previous status come from one locked read: a deal closed
    // concurrently is never reopened, and only a real change records a STATUS_CHANGED event.
    const updateOpenStatus = SqlSchema.findOneOption({
      Request: Schema.Struct({ id: Schema.String, status: OpenDealStatus }),
      Result: Schema.Struct({ previousStatus: OpenDealStatus }),
      execute: ({ id, status }) => sql`
        WITH current AS (
          SELECT id, status FROM deals
          WHERE id = ${id} AND status NOT IN ('WON', 'LOST')
          FOR UPDATE
        )
        UPDATE deals d SET status = ${status}, updated_at = now()
        FROM current c
        WHERE d.id = c.id
        RETURNING c.status AS "previousStatus"
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

    const insertEvent = SqlSchema.void({
      Request: NewDealEvent,
      execute: (event) => sql`
        INSERT INTO deal_events (deal_id, actor_id, type, status, lost_reason, seller_id)
        VALUES (${event.dealId}, ${event.actorId}, ${event.type}, ${event.status},
                ${event.lostReason}, ${event.sellerId})
      `,
    })

    const insertComment = SqlSchema.findOne({
      Request: NewDealComment,
      Result: CommentRow,
      execute: (comment) => sql`
        WITH inserted AS (
          INSERT INTO deal_comments (deal_id, author_id, body)
          VALUES (${comment.dealId}, ${comment.authorId}, ${comment.body})
          RETURNING id, author_id, body, created_at
        )
        SELECT i.id, 'COMMENT' AS kind, i.body, u.id AS "authorId", u.name AS "authorName",
               i.created_at AS "createdAt"
        FROM inserted i
        JOIN users u ON u.id = i.author_id
      `,
    })

    const listActivities = SqlSchema.findAll({
      Request: Schema.String,
      Result: ActivityRow,
      execute: (dealId) => sql`
        SELECT c.id, 'COMMENT' AS kind, c.body, NULL::text AS status, NULL::text AS "lostReason",
               NULL::uuid AS "sellerId", NULL::text AS "sellerName",
               a.id AS "authorId", a.name AS "authorName", c.created_at AS "createdAt", c.seq
        FROM deal_comments c
        JOIN users a ON a.id = c.author_id
        WHERE c.deal_id = ${dealId}
        UNION ALL
        SELECT e.id, e.type, NULL::text, e.status, e.lost_reason, s.id, s.name,
               a.id, a.name, e.created_at, e.seq
        FROM deal_events e
        JOIN users a ON a.id = e.actor_id
        LEFT JOIN users s ON s.id = e.seller_id
        WHERE e.deal_id = ${dealId}
        ORDER BY "createdAt" DESC, seq DESC
      `,
    })

    const noEventPayload = { status: null, lostReason: null, sellerId: null }

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
          yield* insertEvent({
            dealId: id,
            actorId: deal.createdBy,
            type: "CREATED",
            ...noEventPayload,
          })
          yield* insertEvent({
            dealId: id,
            actorId: deal.createdBy,
            type: "SELLER_ASSIGNED",
            ...noEventPayload,
            sellerId: deal.sellerId,
          })
          return yield* readBack(id)
        }).pipe(sql.withTransaction, dieOnMissingRow, dieOnSchemaError),
      moveOpen: (id, status, actorId) =>
        Effect.gen(function* () {
          const updated = yield* updateOpenStatus({ id, status })
          if (Option.isNone(updated)) return Option.none()
          if (updated.value.previousStatus !== status)
            yield* insertEvent({
              dealId: id,
              actorId,
              type: "STATUS_CHANGED",
              ...noEventPayload,
              status,
            })
          return Option.some(yield* readBack(id))
        }).pipe(sql.withTransaction, dieOnSchemaError),
      close: (id, closing, actorId) =>
        Effect.gen(function* () {
          const updated = yield* updateClosing({ id, closing })
          if (Option.isNone(updated)) return Option.none()
          yield* insertEvent(
            closing.status === "WON"
              ? { dealId: id, actorId, type: "WON", ...noEventPayload }
              : {
                  dealId: id,
                  actorId,
                  type: "LOST",
                  ...noEventPayload,
                  lostReason: closing.lostReason,
                },
          )
          return Option.some(yield* readBack(id))
        }).pipe(sql.withTransaction, dieOnSchemaError),
      listActivities: (dealId) =>
        listActivities(dealId).pipe(
          dieOnSchemaError,
          Effect.map((rows) => rows.map(toActivity)),
        ),
      addComment: (comment) =>
        insertComment(comment).pipe(Effect.map(toComment), dieOnMissingRow, dieOnSchemaError),
    }
  }),
)
