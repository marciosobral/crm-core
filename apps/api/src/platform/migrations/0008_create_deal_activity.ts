import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"

// Deals that predate the activity tables get the events their columns prove: creation, the seller (fixed since creation) and the closing.
// Closing never stored who closed a deal, so those events credit its creator.
export const backfillDealEvents = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`
    INSERT INTO deal_events (deal_id, actor_id, type, seller_id, created_at)
    SELECT d.id, d.created_by, t.type,
           CASE WHEN t.type = 'SELLER_ASSIGNED' THEN d.seller_id END, d.created_at
    FROM deals d
    CROSS JOIN (VALUES (1, 'CREATED'), (2, 'SELLER_ASSIGNED')) AS t (position, type)
    WHERE NOT EXISTS (
      SELECT 1 FROM deal_events e WHERE e.deal_id = d.id AND e.type IN ('CREATED', 'SELLER_ASSIGNED')
    )
    ORDER BY d.created_at, d.id, t.position
  `
  yield* sql`
    INSERT INTO deal_events (deal_id, actor_id, type, lost_reason, created_at)
    SELECT d.id, d.created_by, d.status, d.lost_reason, d.closed_at
    FROM deals d
    WHERE d.status IN ('WON', 'LOST')
      AND NOT EXISTS (
        SELECT 1 FROM deal_events e WHERE e.deal_id = d.id AND e.type IN ('WON', 'LOST')
      )
    ORDER BY d.closed_at, d.id
  `
})

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`
    CREATE TABLE deal_comments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      seq bigint GENERATED ALWAYS AS IDENTITY,
      deal_id uuid NOT NULL REFERENCES deals (id),
      author_id uuid NOT NULL REFERENCES users (id),
      body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `
  yield* sql`CREATE INDEX deal_comments_deal_id_created_at_idx ON deal_comments (deal_id, created_at DESC)`
  yield* sql`
    CREATE TABLE deal_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      seq bigint GENERATED ALWAYS AS IDENTITY,
      deal_id uuid NOT NULL REFERENCES deals (id),
      actor_id uuid NOT NULL REFERENCES users (id),
      type text NOT NULL CHECK (type IN ('CREATED','SELLER_ASSIGNED','STATUS_CHANGED','WON','LOST')),
      status text CHECK (status IN ('NEW','CONTACTED','PROPOSAL_SENT','NEGOTIATION')),
      lost_reason text CHECK (lost_reason IN ('PRICE','COMPETITOR','NO_BUDGET','NO_RESPONSE','GAVE_UP','OTHER')),
      seller_id uuid REFERENCES users (id),
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT deal_events_payload_check CHECK (
        (type = 'STATUS_CHANGED' AND status IS NOT NULL AND lost_reason IS NULL AND seller_id IS NULL)
        OR (type = 'LOST' AND lost_reason IS NOT NULL AND status IS NULL AND seller_id IS NULL)
        OR (type = 'SELLER_ASSIGNED' AND seller_id IS NOT NULL AND status IS NULL AND lost_reason IS NULL)
        OR (type IN ('CREATED','WON') AND status IS NULL AND lost_reason IS NULL AND seller_id IS NULL)
      )
    )
  `
  yield* sql`CREATE INDEX deal_events_deal_id_created_at_idx ON deal_events (deal_id, created_at DESC)`
  yield* backfillDealEvents
})
