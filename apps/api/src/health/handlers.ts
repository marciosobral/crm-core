import { CrmApi, HealthStatus } from "@crm/contract"
import { Effect } from "effect"
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi"
import { SqlClient } from "effect/unstable/sql"

export const HealthLive = HttpApiBuilder.group(CrmApi, "health", (handlers) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const healthy = new HealthStatus({ status: "ok" })
    return handlers
      .handle("live", () => Effect.succeed(healthy))
      .handle("ready", () =>
        sql`SELECT 1`.pipe(
          Effect.as(healthy),
          Effect.mapError(() => new HttpApiError.ServiceUnavailable()),
        ),
      )
  }),
)
