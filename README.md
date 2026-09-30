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

If you already have an `apps/api/.env`, add the `SEED_*` variables from `apps/api/.env.example`; the API does not start without them.

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
| api | `CORS_ORIGIN` | web origin allowed by CORS and for unsafe requests (exact match, no trailing slash) (default `http://localhost:5173`) |
| api | `NODE_ENV` | `development`, `test` or `production` (any other value fails startup); `production` refuses the example seed passwords (default `development`; the Dockerfile sets `production`) |
| api | `SEED_DEMO_PASSWORD` | password of the seeded demo account (supervisor) (min. 12 characters, applied once by the seed migration) |
| api | `SEED_SELLER_PASSWORD` | password of the other seeded accounts (the sellers) (same rules) |
| web | `VITE_API_URL` | API base URL |

## Demo accounts

The seed migration creates three fictional accounts (one supervisor, two sellers). Their passwords come from `SEED_DEMO_PASSWORD` and `SEED_SELLER_PASSWORD`, never from the code. With `NODE_ENV=production` (set by the API Dockerfile), the seed refuses the public example passwords from `.env.example`.

| Account | Role | Local password (`apps/api/.env.example`) |
|---|---|---|
| `demo@crm-core.dev` | Supervisor | `demo-crm-1234` |
| `ana.souza@crm-core.dev`, `bruno.lima@crm-core.dev` | Seller | `seller-crm-1234` |

Supervisors see every lead and choose its responsible seller; sellers see and create only their own leads.

The deployed app is not public: its passwords are set on Render and shared on request.

## Deploy

| Part | Service | Project | Config |
|---|---|---|---|
| API | Render (free, Docker) | `crm-core-api` | `render.yaml` (Blueprint), `apps/api/Dockerfile` |
| Database | Neon (free, Postgres 18) | `crm-core-db` | `DATABASE_URL` on Render |
| Web | Cloudflare Workers (free, static assets) | `crm-core-web` | `apps/web/wrangler.jsonc` |

The web app is served from `crm-core.marciosobral.com` and the API from `crm-core-api.marciosobral.com`. Since both are on the same site, session cookies work without relying on third-party cookies.

Render's free instance sleeps after 15 minutes without traffic, so **the first request after that can take about a minute**.

Deploys run from the `deploy` job in `.github/workflows/ci.yml` on every push to `main`, after `check` passes. When `apps/api`, `packages/contract` or the workspace manifests changed since the commit Render has live (or that commit cannot be determined), it deploys the API on Render and waits until it is live; then it deploys the web app with Wrangler. The web app never reaches users before the API it calls. Required GitHub settings:

| Name | Kind | Value |
|---|---|---|
| `RENDER_API_KEY` | Secret | Render API key |
| `RENDER_SERVICE_ID` | Variable | ID of `crm-core-api` (`srv-...`) |
| `CLOUDFLARE_API_TOKEN` | Secret | Token with the "Edit Cloudflare Workers" template |
| `CLOUDFLARE_ACCOUNT_ID` | Variable | Cloudflare account ID |
