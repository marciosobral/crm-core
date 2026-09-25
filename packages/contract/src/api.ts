import { HttpApi } from "effect/unstable/httpapi"
import { HealthGroup } from "./health.ts"

export class CrmApi extends HttpApi.make("crm").add(HealthGroup) {}
