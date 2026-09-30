import { HttpApi } from "effect/unstable/httpapi"
import { AuthGroup } from "./auth.ts"
import { DealsGroup } from "./deals.ts"
import { HealthGroup } from "./health.ts"
import { LeadsGroup } from "./leads.ts"
import { SellersGroup } from "./sellers.ts"

export class CrmApi extends HttpApi.make("crm")
  .add(HealthGroup)
  .add(AuthGroup)
  .add(LeadsGroup)
  .add(DealsGroup)
  .add(SellersGroup) {}
