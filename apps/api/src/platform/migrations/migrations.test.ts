import { Role } from "@crm/contract"
import { expect, it } from "@effect/vitest"
import { Effect, Redacted, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { verifyPassword } from "#src/auth/password.ts"
import { demoPassword, seededEmails, TestDatabase } from "#src/testing/database.ts"
import { backfillDealEvents } from "./0008_create_deal_activity.ts"

it.effect("creates the tables and seeds the sellers with hashed passwords", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const users = yield* sql`
      SELECT email, role, password_hash AS "passwordHash" FROM users ORDER BY email
    `.pipe(
      Effect.flatMap(
        Schema.decodeUnknownEffect(
          Schema.Array(
            Schema.Struct({ email: Schema.String, role: Role, passwordHash: Schema.String }),
          ),
        ),
      ),
    )
    expect(users.map(({ email, role }) => [email, role])).toEqual([
      [seededEmails.ana, "SELLER"],
      [seededEmails.bruno, "SELLER"],
      [seededEmails.demo, "SUPERVISOR"],
    ])
    expect(users.map(({ email }) => email)).toEqual([
      seededEmails.ana,
      seededEmails.bruno,
      seededEmails.demo,
    ])
    const demo = users.find(({ email }) => email === seededEmails.demo)
    expect(yield* verifyPassword(Redacted.make(demoPassword), demo?.passwordHash ?? "")).toBe(true)
    const sessions = yield* sql`SELECT count(*)::int AS count FROM sessions`.pipe(
      Effect.flatMap(
        Schema.decodeUnknownEffect(Schema.Tuple([Schema.Struct({ count: Schema.Number })])),
      ),
    )
    expect(sessions[0].count).toBe(0)
  }).pipe(Effect.provide(TestDatabase)),
)

const decodeIdRow = Schema.decodeUnknownEffect(Schema.Tuple([Schema.Struct({ id: Schema.String })]))

it.effect("rejects a closed deal that has no loss reason", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [seller] = yield* sql`SELECT id FROM users WHERE email = ${seededEmails.ana}`.pipe(
      Effect.flatMap(decodeIdRow),
    )
    const [lead] = yield* sql`
      INSERT INTO leads (name, company, email, phone, source, seller_id, created_by)
      VALUES ('Thiago Lima', 'Academia X', 'thiago@academiax.com.br', '11983111234', 'REFERRAL', ${seller.id}, ${seller.id})
      RETURNING id
    `.pipe(Effect.flatMap(decodeIdRow))
    const [deal] = yield* sql`
      INSERT INTO deals (title, value_cents, status, lead_id, seller_id, created_by)
      VALUES ('Kit Completo', 100, 'NEW', ${lead.id}, ${seller.id}, ${seller.id})
      RETURNING id
    `.pipe(Effect.flatMap(decodeIdRow))
    const error = yield* sql`UPDATE deals SET status = 'LOST' WHERE id = ${deal.id}`.pipe(
      Effect.flip,
    )
    expect(error._tag).toBe("SqlError")
  }).pipe(Effect.provide(TestDatabase)),
)

const decodeEventRows = Schema.decodeUnknownEffect(
  Schema.Array(
    Schema.Struct({
      type: Schema.String,
      lostReason: Schema.NullOr(Schema.String),
      sellerId: Schema.NullOr(Schema.String),
    }),
  ),
)

it.effect("backfills the events of deals created before the activity tables", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [seller] = yield* sql`SELECT id FROM users WHERE email = ${seededEmails.ana}`.pipe(
      Effect.flatMap(decodeIdRow),
    )
    const [lead] = yield* sql`
      INSERT INTO leads (name, company, email, phone, source, seller_id, created_by)
      VALUES ('Thiago Lima', 'Academia X', 'thiago@academiax.com.br', '11983111234', 'REFERRAL', ${seller.id}, ${seller.id})
      RETURNING id
    `.pipe(Effect.flatMap(decodeIdRow))
    const [deal] = yield* sql`
      INSERT INTO deals (title, value_cents, status, lost_reason, closed_at, lead_id, seller_id, created_by)
      VALUES ('Kit Completo', 100, 'LOST', 'PRICE', now(), ${lead.id}, ${seller.id}, ${seller.id})
      RETURNING id
    `.pipe(Effect.flatMap(decodeIdRow))
    yield* backfillDealEvents
    yield* backfillDealEvents
    const events = yield* sql`
      SELECT type, lost_reason AS "lostReason", seller_id AS "sellerId"
      FROM deal_events WHERE deal_id = ${deal.id} ORDER BY seq
    `.pipe(Effect.flatMap(decodeEventRows))
    expect(events).toEqual([
      { type: "CREATED", lostReason: null, sellerId: null },
      { type: "SELLER_ASSIGNED", lostReason: null, sellerId: seller.id },
      { type: "LOST", lostReason: "PRICE", sellerId: null },
    ])
    const error = yield* sql`
      INSERT INTO deal_events (deal_id, actor_id, type) VALUES (${deal.id}, ${seller.id}, 'STATUS_CHANGED')
    `.pipe(Effect.flip)
    expect(error._tag).toBe("SqlError")
  }).pipe(Effect.provide(TestDatabase)),
)
