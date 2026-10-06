import { AssistantLink, type AssistantMessage, AssistantMessageRole } from "@crm/contract"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { SqlClient, type SqlError, SqlSchema } from "effect/unstable/sql"
import { dieOnMissingRow, dieOnSchemaError } from "#src/platform/sql.ts"
import { ToolTrace } from "./trace.ts"

const ConversationRow = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  summary: Schema.NullOr(Schema.String),
  summarizedUpTo: Schema.Number,
  updatedAt: Schema.DateTimeUtcFromDate,
})
export type Conversation = typeof ConversationRow.Type

const ConversationListRow = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  updatedAt: Schema.DateTimeUtcFromDate,
})

// Links are decoded one by one after reading, so a stored link the contract no longer accepts
// is dropped instead of making the whole conversation unreadable.
const MessageRow = Schema.Struct({
  id: Schema.String,
  role: AssistantMessageRole,
  content: Schema.String,
  links: Schema.Array(Schema.Unknown),
  createdAt: Schema.DateTimeUtcFromDate,
})

// The trace is read with the context window only. An invalid stored trace is dropped like an
// invalid link: the message stays usable, without the extra context.
const ContextMessageRow = Schema.Struct({
  ...MessageRow.fields,
  toolTrace: Schema.NullOr(Schema.Unknown),
})

export type ContextMessage = AssistantMessage & { readonly trace: ToolTrace }

const decodeLink = Schema.decodeUnknownOption(AssistantLink)
const decodeTrace = Schema.decodeUnknownOption(ToolTrace)

const toMessage = ({ links, ...row }: typeof MessageRow.Type) =>
  Effect.gen(function* () {
    const decoded = links.flatMap((link) => Option.toArray(decodeLink(link)))
    if (decoded.length < links.length)
      yield* Effect.logWarning("Stored assistant links dropped").pipe(
        Effect.annotateLogs({ messageId: row.id, dropped: links.length - decoded.length }),
      )
    return { ...row, links: decoded }
  })

const toContextMessage = ({ toolTrace, ...row }: typeof ContextMessageRow.Type) =>
  Effect.gen(function* () {
    const message = yield* toMessage(row)
    if (toolTrace === null) return { ...message, trace: [] }
    const trace = decodeTrace(toolTrace)
    if (Option.isNone(trace))
      yield* Effect.logWarning("Stored assistant tool trace dropped").pipe(
        Effect.annotateLogs({ messageId: row.id }),
      )
    return { ...message, trace: Option.getOrElse(trace, () => []) }
  })

const toMessages = (rows: ReadonlyArray<typeof MessageRow.Type>) => Effect.forEach(rows, toMessage)

const NewMessage = Schema.Struct({
  conversationId: Schema.String,
  role: AssistantMessageRole,
  content: Schema.String,
  links: Schema.Array(AssistantLink),
  toolTrace: Schema.NullOr(ToolTrace),
})

export class ConversationsRepository extends Context.Service<
  ConversationsRepository,
  {
    // create and appendMessage are only called by saveExchange and by tests that seed conversations.
    readonly create: (
      userId: string,
      title: string,
    ) => Effect.Effect<Conversation, SqlError.SqlError>
    readonly findOwned: (
      id: string,
      userId: string,
    ) => Effect.Effect<Option.Option<Conversation>, SqlError.SqlError>
    readonly listForUser: (
      userId: string,
      limit: number,
    ) => Effect.Effect<ReadonlyArray<typeof ConversationListRow.Type>, SqlError.SqlError>
    readonly appendMessage: (
      conversationId: string,
      role: AssistantMessage["role"],
      content: string,
      links: AssistantMessage["links"],
      trace?: ToolTrace,
    ) => Effect.Effect<AssistantMessage, SqlError.SqlError>
    readonly recentMessages: (
      conversationId: string,
      count: number,
    ) => Effect.Effect<ReadonlyArray<AssistantMessage>, SqlError.SqlError>
    readonly recentContext: (
      conversationId: string,
      count: number,
    ) => Effect.Effect<ReadonlyArray<ContextMessage>, SqlError.SqlError>
    readonly countMessages: (conversationId: string) => Effect.Effect<number, SqlError.SqlError>
    readonly messagesRange: (
      conversationId: string,
      offset: number,
      limit: number,
    ) => Effect.Effect<ReadonlyArray<AssistantMessage>, SqlError.SqlError>
    readonly updateSummary: (
      id: string,
      summary: string,
      summarizedUpTo: number,
    ) => Effect.Effect<void, SqlError.SqlError>
    readonly saveExchange: (exchange: {
      readonly userId: string
      readonly conversationId: string | null
      readonly title: string
      readonly userContent: string
      readonly replyContent: string
      readonly replyLinks: AssistantMessage["links"]
      readonly replyTrace: ToolTrace
    }) => Effect.Effect<
      {
        readonly conversationId: string
        readonly userMessage: AssistantMessage
        readonly reply: AssistantMessage
      },
      SqlError.SqlError
    >
  }
>()("crm/ConversationsRepository") {}

export const ConversationsRepositoryLive = Layer.effect(
  ConversationsRepository,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const insertConversation = SqlSchema.findOne({
      Request: Schema.Struct({ userId: Schema.String, title: Schema.String }),
      Result: ConversationRow,
      execute: ({ userId, title }) => sql`
        INSERT INTO assistant_conversations (user_id, title) VALUES (${userId}, ${title})
        RETURNING id, title, summary, summarized_up_to AS "summarizedUpTo", updated_at AS "updatedAt"
      `,
    })

    const findConversation = SqlSchema.findOneOption({
      Request: Schema.Struct({ id: Schema.String, userId: Schema.String }),
      Result: ConversationRow,
      execute: ({ id, userId }) => sql`
        SELECT id, title, summary, summarized_up_to AS "summarizedUpTo", updated_at AS "updatedAt"
        FROM assistant_conversations
        WHERE id = ${id} AND user_id = ${userId}
      `,
    })

    const listConversations = SqlSchema.findAll({
      Request: Schema.Struct({ userId: Schema.String, limit: Schema.Number }),
      Result: ConversationListRow,
      execute: ({ userId, limit }) => sql`
        SELECT id, title, updated_at AS "updatedAt" FROM assistant_conversations
        WHERE user_id = ${userId}
        ORDER BY updated_at DESC, id
        LIMIT ${limit}
      `,
    })

    const insertMessage = SqlSchema.findOne({
      Request: NewMessage,
      Result: MessageRow,
      execute: ({ conversationId, role, content, links, toolTrace }) => sql`
        INSERT INTO assistant_messages (conversation_id, role, content, links, tool_trace)
        VALUES (
          ${conversationId}, ${role}, ${content}, ${JSON.stringify(links)}::jsonb,
          ${toolTrace === null ? null : JSON.stringify(toolTrace)}::jsonb
        )
        RETURNING id, role, content, links, created_at AS "createdAt"
      `,
    })

    const selectRecent = SqlSchema.findAll({
      Request: Schema.Struct({ conversationId: Schema.String, count: Schema.Number }),
      Result: ContextMessageRow,
      execute: ({ conversationId, count }) => sql`
        SELECT id, role, content, links, "toolTrace", "createdAt" FROM (
          SELECT id, role, content, links, tool_trace AS "toolTrace", created_at AS "createdAt", seq
          FROM assistant_messages
          WHERE conversation_id = ${conversationId}
          ORDER BY seq DESC
          LIMIT ${count}
        ) recent
        ORDER BY seq
      `,
    })

    const selectCount = SqlSchema.findOne({
      Request: Schema.String,
      Result: Schema.Struct({ count: Schema.Number }),
      execute: (conversationId) => sql`
        SELECT count(*)::int AS count FROM assistant_messages WHERE conversation_id = ${conversationId}
      `,
    })

    const selectRange = SqlSchema.findAll({
      Request: Schema.Struct({
        conversationId: Schema.String,
        offset: Schema.Number,
        limit: Schema.Number,
      }),
      Result: MessageRow,
      execute: ({ conversationId, offset, limit }) => sql`
        SELECT id, role, content, links, created_at AS "createdAt"
        FROM assistant_messages
        WHERE conversation_id = ${conversationId}
        ORDER BY seq
        LIMIT ${limit} OFFSET ${offset}
      `,
    })

    const writeSummary = SqlSchema.void({
      Request: Schema.Struct({
        id: Schema.String,
        summary: Schema.String,
        summarizedUpTo: Schema.Number,
      }),
      execute: ({ id, summary, summarizedUpTo }) => sql`
        UPDATE assistant_conversations
        SET summary = ${summary}, summarized_up_to = ${summarizedUpTo}
        WHERE id = ${id}
      `,
    })

    const touchConversation = SqlSchema.void({
      Request: Schema.String,
      execute: (id) => sql`UPDATE assistant_conversations SET updated_at = now() WHERE id = ${id}`,
    })

    const create = (userId: string, title: string) =>
      insertConversation({ userId, title }).pipe(dieOnMissingRow, dieOnSchemaError)

    const appendMessage = (
      conversationId: string,
      role: AssistantMessage["role"],
      content: string,
      links: AssistantMessage["links"],
      trace: ToolTrace = [],
    ) =>
      insertMessage({
        conversationId,
        role,
        content,
        links,
        toolTrace: trace.length === 0 ? null : trace,
      }).pipe(dieOnMissingRow, dieOnSchemaError, Effect.flatMap(toMessage))

    const touch = (id: string) => touchConversation(id).pipe(dieOnSchemaError)

    return ConversationsRepository.of({
      create,
      findOwned: (id, userId) => findConversation({ id, userId }).pipe(dieOnSchemaError),
      listForUser: (userId, limit) => listConversations({ userId, limit }).pipe(dieOnSchemaError),
      appendMessage,
      recentMessages: (conversationId, count) =>
        selectRecent({ conversationId, count }).pipe(
          dieOnSchemaError,
          Effect.map((rows) => rows.map(({ toolTrace: _toolTrace, ...message }) => message)),
          Effect.flatMap(toMessages),
        ),
      recentContext: (conversationId, count) =>
        selectRecent({ conversationId, count }).pipe(
          dieOnSchemaError,
          Effect.flatMap((rows) => Effect.forEach(rows, toContextMessage)),
        ),
      countMessages: (conversationId) =>
        selectCount(conversationId).pipe(
          dieOnMissingRow,
          dieOnSchemaError,
          Effect.map(({ count }) => count),
        ),
      messagesRange: (conversationId, offset, limit) =>
        selectRange({ conversationId, offset, limit }).pipe(
          dieOnSchemaError,
          Effect.flatMap(toMessages),
        ),
      updateSummary: (id, summary, summarizedUpTo) =>
        writeSummary({ id, summary, summarizedUpTo }).pipe(dieOnSchemaError),
      saveExchange: (exchange) =>
        sql.withTransaction(
          Effect.gen(function* () {
            const conversationId =
              exchange.conversationId ?? (yield* create(exchange.userId, exchange.title)).id
            const userMessage = yield* appendMessage(
              conversationId,
              "USER",
              exchange.userContent,
              [],
            )
            const reply = yield* appendMessage(
              conversationId,
              "ASSISTANT",
              exchange.replyContent,
              exchange.replyLinks,
              exchange.replyTrace,
            )
            yield* touch(conversationId)
            return { conversationId, userMessage, reply }
          }),
        ),
    })
  }),
)
