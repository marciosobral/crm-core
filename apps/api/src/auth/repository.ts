import { Role, rolePermissions, User } from "@crm/contract"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { SqlClient, type SqlError, SqlSchema } from "effect/unstable/sql"
import { dieOnSchemaError } from "#src/platform/sql.ts"
import { sessionMaxAge } from "./session-token.ts"

const UserRow = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
  role: Role,
})

const UserWithPassword = Schema.Struct({ ...UserRow.fields, passwordHash: Schema.String })

export const toUser = (row: typeof UserRow.Type) =>
  new User({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    permissions: rolePermissions[row.role],
  })

const NewSession = Schema.Struct({ id: Schema.String, userId: Schema.String })

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
        SELECT id, name, email, role, password_hash AS "passwordHash"
        FROM users WHERE lower(email) = lower(${email})
      `,
    })

    const findUserBySession = SqlSchema.findOneOption({
      Request: Schema.String,
      Result: UserRow,
      execute: (sessionId) => sql`
        SELECT u.id, u.name, u.email, u.role
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
      findUserBySession: (sessionId) =>
        findUserBySession(sessionId).pipe(dieOnSchemaError, Effect.map(Option.map(toUser))),
      deleteExpiredSessions: (userId) => deleteExpiredSessions(userId).pipe(dieOnSchemaError),
      createSession: (session) => createSession(session).pipe(dieOnSchemaError),
      deleteSession: (sessionId) => deleteSession(sessionId).pipe(dieOnSchemaError),
    }
  }),
)
