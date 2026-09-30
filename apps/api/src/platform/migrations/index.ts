import { Layer } from "effect"
import { Migrator } from "effect/unstable/sql"
import createUsers from "./0001_create_users.ts"
import createSessions from "./0002_create_sessions.ts"
import seedSellers from "./0003_seed_sellers.ts"
import addUserRoles from "./0004_add_user_roles.ts"
import createLeads from "./0005_create_leads.ts"

const loader = Migrator.fromRecord({
  "0001_create_users": createUsers,
  "0002_create_sessions": createSessions,
  "0003_seed_sellers": seedSellers,
  "0004_add_user_roles": addUserRoles,
  "0005_create_leads": createLeads,
})

// The generic migrator only needs SqlClient, so the same layer serves Postgres and PGlite
// (PgMigrator additionally requires pg_dump services even when no schema dump is requested).
export const MigrationsLive = Layer.effectDiscard(Migrator.make({})({ loader }))
