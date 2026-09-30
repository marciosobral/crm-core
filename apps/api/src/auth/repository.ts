import { User } from "@crm/contract"
import { Context, Effect, Layer, type Option, Schema } from "effect"
import { SqlClient, type SqlError, SqlSchema } from "effect/unstable/sql"
import { sessionMaxAge } from "./session-token.ts"

const UserWithPassword = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
  passwordHash: Schema.String,
})

const NewSession = Schema.Struct({ id: Schema.String, userId: Schema.String })

// A row that does not match its schema means code and migrations disagree: a bug, not a
// condition callers can handle, so it becomes a defect.
const dieOnSchemaError = <A, E, R>(effect: Effect.Effect<A, E | Schema.SchemaError, R>) =>
  Effect.catchTag(effect, "SchemaError", (error) => Effect.die(error))

export class AuthRepository extends Context.Service<
  AuthRepository,
  {
    readonly findUserByEmail: (
      email: string,
    ) => Effect.Effect<Option.Option<typeof UserWithPassword.Type>, SqlError.SqlError>
    readonly findUserBySession: (
      sessionId: string,
    ) => Effect.Effect<Option.Option<User>, SqlError.SqlError>
    readonly deleteExpiredSessions: (userId: string) => Effect.Effect<void, SqlError.SqlError>
    readonly createSession: (
      session: typeof NewSession.Type,
    ) => Effect.Effect<void, SqlError.SqlError>
    readonly deleteSession: (sessionId: string) => Effect.Effect<void, SqlError.SqlError>
  }
>()("crm/AuthRepository") {}

export const AuthRepositoryLive = Layer.effect(
  AuthRepository,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const findUserByEmail = SqlSchema.findOneOption({
      Request: Schema.String,
      Result: UserWithPassword,
      execute: (email) => sql`
        SELECT id, name, email, password_hash AS "passwordHash"
        FROM users WHERE lower(email) = lower(${email})
      `,
    })

    const findUserBySession = SqlSchema.findOneOption({
      Request: Schema.String,
      Result: User,
      execute: (sessionId) => sql`
        SELECT u.id, u.name, u.email
        FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.id = ${sessionId} AND s.expires_at > now()
      `,
    })

    const deleteExpiredSessions = SqlSchema.void({
      Request: Schema.String,
      execute: (userId) =>
        sql`DELETE FROM sessions WHERE user_id = ${userId} AND expires_at <= now()`,
    })

    const createSession = SqlSchema.void({
      Request: NewSession,
      execute: ({ id, userId }) => sql`
        INSERT INTO sessions (id, user_id, expires_at)
        VALUES (${id}, ${userId}, now() + ${sessionMaxAge}::interval)
      `,
    })

    const deleteSession = SqlSchema.void({
      Request: Schema.String,
      execute: (sessionId) => sql`DELETE FROM sessions WHERE id = ${sessionId}`,
    })

    return {
      findUserByEmail: (email) => findUserByEmail(email).pipe(dieOnSchemaError),
      findUserBySession: (sessionId) => findUserBySession(sessionId).pipe(dieOnSchemaError),
      deleteExpiredSessions: (userId) => deleteExpiredSessions(userId).pipe(dieOnSchemaError),
      createSession: (session) => createSession(session).pipe(dieOnSchemaError),
      deleteSession: (sessionId) => deleteSession(sessionId).pipe(dieOnSchemaError),
    }
  }),
)
