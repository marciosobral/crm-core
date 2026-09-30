import { HttpApi } from "effect/unstable/httpapi"
import { AuthGroup } from "./auth.ts"
import { HealthGroup } from "./health.ts"

export class CrmApi extends HttpApi.make("crm").add(HealthGroup).add(AuthGroup) {}
