import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiError, HttpApiGroup } from "effect/unstable/httpapi"
import { Authorization } from "./auth.ts"

export class Seller extends Schema.Class<Seller>("Seller")({
  id: Schema.String,
  name: Schema.String,
}) {}

export class SellersGroup extends HttpApiGroup.make("sellers").add(
  HttpApiEndpoint.get("list", "/sellers", {
    success: Schema.Array(Seller),
    error: [HttpApiError.Forbidden, HttpApiError.ServiceUnavailable],
  }).middleware(Authorization),
) {}
