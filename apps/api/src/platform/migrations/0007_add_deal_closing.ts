import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`
    ALTER TABLE deals
      ADD COLUMN lost_reason text CHECK (lost_reason IN ('PRICE','COMPETITOR','NO_BUDGET','NO_RESPONSE','GAVE_UP','OTHER')),
      ADD COLUMN lost_note text,
      ADD COLUMN closed_at timestamptz
  `
  yield* sql`
    ALTER TABLE deals ADD CONSTRAINT deals_closing_check CHECK (
      (status = 'LOST' AND lost_reason IS NOT NULL AND closed_at IS NOT NULL)
      OR (status = 'WON' AND closed_at IS NOT NULL AND lost_reason IS NULL AND lost_note IS NULL)
      OR (status IN ('NEW','CONTACTED','PROPOSAL_SENT','NEGOTIATION')
          AND closed_at IS NULL AND lost_reason IS NULL AND lost_note IS NULL)
    )
  `
})
