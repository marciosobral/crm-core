# crm-core

A CRM built as an end-to-end TypeScript monorepo, with [Effect](https://effect.website/) powering the backend and the API contract.

## Stack

| Layer | Technology |
|---|---|
| Monorepo | pnpm workspaces, Turborepo, Biome |
| API contract | `@crm/contract`: Effect `HttpApi` + `Schema`, shared by the API and the web app |
| API | Effect v4 (`HttpApiBuilder`, Layers/Services, `Config`) on `@effect/platform-node` |
| Database | PostgreSQL 18 via `@effect/sql-pg`; in-process PGlite via `@effect/sql-pglite` |
| Web | React 19 SPA with Vite, TanStack Router (file-based), TanStack Query, Tailwind v4 |
| Tests | Vitest + `@effect/vitest` |
| Deploy | API on Render (Docker), database on Neon, SPA on Cloudflare Workers (static assets) |

## Structure

```
apps/
  api/        Effect HTTP server (Node runs the TypeScript directly, no build step)
  web/        React SPA (Vite)
packages/
  contract/   HttpApi contract + shared schemas
```

The contract lives in `packages/contract`. The API implements it with `HttpApiBuilder.group`, and the web app derives a typed client from it (`HttpApiClient`). Requests, responses and errors are typed end to end, with no code generation.

## Running locally

Requirements: Node 24 (`.nvmrc`; 22.12+ also works) and pnpm 10 (`corepack enable`).

```bash
pnpm install
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

**Database: pick one**

- Without Docker (PGlite): in `apps/api/.env`, set `DATABASE_PGLITE=1`. Data is persisted in `PGLITE_DATA_DIR`; comment that line out to keep the database in memory (wiped on every restart).
- With Docker (Postgres 18): `docker compose up -d`. If port 5432 is taken, change `POSTGRES_PORT` in `.env` and the port in `DATABASE_URL`.

**Start everything**

```bash
pnpm dev
```

- API: http://localhost:3001/health (liveness) and http://localhost:3001/health/ready (checks the database)
- Web: http://localhost:5173

### Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | API (watch mode) + web (Vite) |
| `pnpm build` | production build of the web app |
| `pnpm typecheck` | `tsc` across all packages |
| `pnpm test` | tests (Vitest) |
| `pnpm lint` / `pnpm lint:fix` | Biome |

### Environment variables

| App | Variable | Description |
|---|---|---|
| root | `POSTGRES_PORT` | host port for the Docker Compose Postgres (default `5432`) |
| api | `DATABASE_URL` | Postgres connection string (`?sslmode=require` on Neon) |
| api | `DATABASE_PGLITE` | `1` uses PGlite instead of Postgres (development only) |
| api | `PGLITE_DATA_DIR` | directory where PGlite persists data (in memory if unset) |
| api | `PORT` | HTTP port (default `3001`) |
| api | `CORS_ORIGIN` | web origin allowed by CORS (default `http://localhost:5173`) |
| web | `VITE_API_URL` | API base URL |

## Deploy

| Part | Service | Project | Config |
|---|---|---|---|
| API | Render (free, Docker) | `crm-core-api` | `render.yaml` (Blueprint), `apps/api/Dockerfile` |
| Database | Neon (free, Postgres 18) | `crm-core-db` | `DATABASE_URL` on Render |
| Web | Cloudflare Workers (free, static assets) | `crm-core-web` | `apps/web/wrangler.jsonc` |

The web app is served from `crm-core.marciosobral.com` and the API from `crm-core-api.marciosobral.com`. Since both are on the same site, session cookies work without relying on third-party cookies.

Render's free instance sleeps after 15 minutes without traffic, so **the first request after that can take about a minute**.
