import {
  AssistantConversation,
  AssistantConversationSummary,
  AssistantReply,
  businessTimeZone,
  type DealStatus,
  type Role,
  rolePermissions,
  User,
} from "@crm/contract"
import { DateTime, Effect, Layer, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { DealsRepositoryLive } from "#src/deals/repository.ts"
import { LeadsRepositoryLive } from "#src/leads/repository.ts"
import { SellersRepositoryLive } from "#src/sellers/repository.ts"
import { jsonOf, jsonRequest, type Send } from "./http.ts"
import { type PromptMessages, toolResultsIn } from "./language-model.ts"

export const decodeReply = Schema.decodeUnknownSync(AssistantReply)
export const decodeSummaries = Schema.decodeUnknownSync(Schema.Array(AssistantConversationSummary))
export const decodeConversation = Schema.decodeUnknownSync(AssistantConversation)
export const decodeStrings = Schema.decodeUnknownSync(Schema.Array(Schema.String))
export const decodeId = Schema.decodeUnknownSync(Schema.Struct({ id: Schema.String }))

export const getAs = (send: Send, cookie: string | undefined, path: string) =>
  send(new Request(`http://localhost${path}`, { headers: cookie ? { cookie } : {} }))

export const sendMessage = (
  send: Send,
  cookie: string,
  message: string,
  conversationId?: string | null,
  context?: unknown,
) =>
  send(
    jsonRequest(
      "POST",
      "/assistant/messages",
      {
        message,
        ...(conversationId ? { conversationId } : {}),
        ...(context === undefined ? {} : { context }),
      },
      cookie,
    ),
  )

export const messagesOf = (send: Send, cookie: string, conversationId: string | null) =>
  Effect.gen(function* () {
    const response = yield* getAs(send, cookie, `/assistant/conversations/${conversationId}`)
    return decodeConversation(yield* jsonOf(response)).messages
  })

export const seedDeal = (
  send: Send,
  cookie: string,
  title: string,
  valueCents: number,
  status: DealStatus = "NEW",
) =>
  Effect.gen(function* () {
    const leadResponse = yield* send(
      jsonRequest(
        "POST",
        "/leads",
        {
          name: `Lead ${title}`,
          company: `Empresa ${title}`,
          email: "lead@empresa.com.br",
          phone: "11983111234",
          source: "REFERRAL",
        },
        cookie,
      ),
    )
    const leadId = decodeId(yield* jsonOf(leadResponse)).id
    const dealResponse = yield* send(
      jsonRequest("POST", "/deals", { title, valueCents, status: "NEW", leadId }, cookie),
    )
    const dealId = decodeId(yield* jsonOf(dealResponse)).id
    if (status !== "NEW")
      yield* send(jsonRequest("PATCH", `/deals/${dealId}/status`, { status }, cookie))
    return dealId
  })

export const closeDeal = (
  sql: SqlClient.SqlClient,
  dealId: string,
  result: "WON" | "LOST",
  closedAt: string,
) =>
  result === "WON"
    ? sql`UPDATE deals SET status = 'WON', closed_at = ${closedAt}::timestamptz WHERE id = ${dealId}`
    : sql`UPDATE deals SET status = 'LOST', lost_reason = 'PRICE', closed_at = ${closedAt}::timestamptz WHERE id = ${dealId}`

// Ana: two deals in negotiation (R$ 50 mil and R$ 30 mil) and one new; Bruno: one in negotiation.
export const seedPipeline = (send: Send, ana: string, bruno: string) =>
  Effect.gen(function* () {
    yield* seedDeal(send, ana, "Academia Alfa", 5_000_000, "NEGOTIATION")
    yield* seedDeal(send, ana, "Academia Beta", 3_000_000, "NEGOTIATION")
    yield* seedDeal(send, ana, "Academia Gama", 1_000_000)
    yield* seedDeal(send, bruno, "Academia Delta", 7_000_000, "NEGOTIATION")
  })

export const noDealFilters = {
  statuses: null,
  minValueCents: null,
  maxValueCents: null,
  idleDays: null,
  expectedClose: null,
  closed: null,
  sellerName: null,
  search: null,
  owner: null,
  sort: null,
}

export const noLeadFilters = { status: null, sellerName: null, search: null, owner: null }

export const negotiationQuery = { ...noDealFilters, statuses: ["NEGOTIATION"] }

export const thisMonth = { kind: "THIS_MONTH", days: null, from: null, to: null }

export const firstToolResult = (messages: PromptMessages | undefined) =>
  messages === undefined ? undefined : toolResultsIn(messages)[0]?.result

export const repositoriesOn = (sql: SqlClient.SqlClient) =>
  Layer.mergeAll(DealsRepositoryLive, LeadsRepositoryLive, SellersRepositoryLive).pipe(
    Layer.provideMerge(DateTime.layerCurrentZoneNamed(businessTimeZone).pipe(Layer.orDie)),
    Layer.provideMerge(Layer.succeed(SqlClient.SqlClient)(sql)),
  )

export const userWith = (role: Role, id: string, name: string) =>
  new User({ id, name, email: `${id}@crm-core.dev`, role, permissions: rolePermissions[role] })
