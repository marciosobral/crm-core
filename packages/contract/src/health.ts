import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiError, HttpApiGroup } from "effect/unstable/httpapi"

export class HealthStatus extends Schema.Class<HealthStatus>("HealthStatus")({
  status: Schema.Literal("ok"),
}) {}

export class HealthGroup extends HttpApiGroup.make("health").add(
  HttpApiEndpoint.get("live", "/health", { success: HealthStatus }),
  HttpApiEndpoint.get("ready", "/health/ready", {
    success: HealthStatus,
    error: HttpApiError.ServiceUnavailable,
  }),
) {}
