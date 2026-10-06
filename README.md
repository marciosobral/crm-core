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
| Tests | Vitest + `@effect/vitest` (API), Playwright (web end to end) |
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
| `pnpm build` | production build of the web app; fails if `VITE_API_URL` is missing, so keep `apps/web/.env` from the setup above |
| `pnpm typecheck` | `tsc` across all packages |
| `pnpm test` | API tests (Vitest, in-memory PGlite) |
| `pnpm test:e2e` | web end-to-end tests (Playwright, Chromium) against an isolated API and web server on ports 3101/5174; run `pnpm --filter @crm/web exec playwright install chromium` once |
| `pnpm lint` / `pnpm lint:fix` | Biome |
| `pnpm --filter @crm/api eval:assistant` | runs the assistant chat questions (data tools, how-to, unsupported, refusals) through the real model against a seeded in-memory database and prints a pass/fail table; needs `AI_API_KEY`, not part of CI |

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
| api | `AI_PROVIDER` | language model provider for the assistant; only `openai` (default `openai`) |
| api | `AI_API_KEY` | provider API key; without it the assistant answers 503 |
| api | `AI_MODEL` | model id (default `gpt-6-luna`) |
| api | `AI_REASONING_EFFORT` | reasoning effort sent to the model: `none`, `minimal`, `low`, `medium`, `high`, `xhigh` or `max` (default `low`) |
| api | `AI_MAX_OUTPUT_TOKENS` | cap on tokens generated per model call, reasoning tokens included; integer of at least 1 (default `2000`) |
| web | `VITE_API_URL` | API base URL (required by `pnpm dev` and `pnpm build`; baked into the bundle at build time) |

All dates and "today" use the business time zone `America/Sao_Paulo` for every user; instants are stored as UTC.

## Demo accounts

The seed migration creates three fictional accounts (one supervisor, two sellers). Their passwords come from `SEED_DEMO_PASSWORD` and `SEED_SELLER_PASSWORD`, never from the code. With `NODE_ENV=production` (set by the API Dockerfile), the seed refuses the public example passwords from `.env.example`.

| Account | Role | Local password (`apps/api/.env.example`) |
|---|---|---|
| `demo@crm-core.dev` | Supervisor | `demo-crm-1234` |
| `ana.souza@crm-core.dev`, `bruno.lima@crm-core.dev` | Seller | `seller-crm-1234` |

Supervisors see every lead and choose its responsible seller; sellers see and create only their own leads.

The deployed app is not public: its passwords are set on Render and shared on request.

## Technical decisions

Why each main tool was picked over the usual alternatives.

- **Effect v4 for the API**: Effect came with the project's scope, but it proved a good fit:
  - Errors are typed values that the compiler follows up to the HTTP boundary, so nothing throws unexpectedly.
  - Dependencies are Layers, so tests swap the database or the language model without mocks.
  - One library covers HTTP, config, SQL, logging, rate limiting and AI, with no glue between separate packages.

  The costs are the learning curve and a release-candidate API, which is pinned through the pnpm catalog.
- **Effect `HttpApi` contract instead of tRPC, OpenAPI codegen or hand-written fetch**: `packages/contract` declares endpoints, schemas and errors once. The API implements it and the web app derives a typed client from it, with no generation step, so a change breaks the typecheck on both sides.
- **Effect AI instead of the OpenAI SDK**:
  - The code talks to `LanguageModel`, and only `provider.ts` knows OpenAI. Switching providers takes a package and a config value.
  - Tool parameters and structured answers reuse `Schema`, and provider failures arrive as typed errors.
  - Tests run on a fake model layer, with no network.
- **Effect SQL instead of an ORM (Prisma, Drizzle)**: queries are plain SQL in per-feature repositories, so what runs is what you read. Rows are decoded with `SqlSchema` into the same Schema types the contract uses, and migrations are Effect programs too.
- **PostgreSQL 18 plus PGlite**: Postgres (Neon) runs in production. PGlite runs the same dialect inside the process, so the API tests and local development need no Docker or database server.
- **Vite SPA instead of Next.js or TanStack Start**: the app sits behind a login, has no SEO or server-rendering needs, and already has a separate Effect API. A static SPA keeps a single server, ships as static assets on Cloudflare Workers, and Vite gives a fast dev loop.
- **TanStack Router instead of React Router**:
  - File-based routes have typed params and typed, validated search params.
  - Filters live in the URL, so a link built by the assistant opens the exact filtered screen.
  - Authentication is one layout route (`_authenticated`).
- **TanStack Query for server state**: it handles caching, refetching and invalidation after mutations without a global store. Query functions call the typed Effect client through `runApi`, so the UI keeps the contract's typed errors.
- **Tailwind CSS v4**: design tokens are CSS variables, there is no CSS-in-JS runtime, and it is quick to match a fixed design and stay responsive down to phone width.
- **Pragmatic drag and drop instead of dnd-kit or react-beautiful-dnd**: it is small, maintained and framework-agnostic (react-beautiful-dnd is deprecated). It drives the board with native drag events and auto-scroll without owning the rendering.
- **pnpm and Turborepo**:
  - Dependencies are isolated strictly.
  - A single catalog keeps every Effect package on the same version.
  - Tasks are cached across the three packages.
- **Biome instead of ESLint and Prettier**: one fast tool and one config for both linting and formatting.
- **Vitest with `@effect/vitest`, and Playwright**: Vitest runs Effect programs directly (`it.effect`, a test clock). Playwright covers the main web flows in a real browser against an isolated API.
- **Render, Neon and Cloudflare Workers**: the API runs as a Docker service on Render, Postgres is managed by Neon, and the SPA is served as static assets on Cloudflare. GitHub Actions deploys all of it only after the `check` job passes.

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
