# AGENTS.md

Guidance for AI agents working in this repository. See `README.md` for setup and deploy.

## Project

CRM monorepo, TypeScript end to end, built on Effect v4 (RC).

```
apps/api/            Effect HTTP server (Node runs .ts directly, no build step)
  src/<feature>/     handlers, data access and tests for one feature
  src/platform/      config, database, server wiring
apps/web/            React SPA (Vite, TanStack Router + Query, Tailwind)
packages/contract/   HttpApi contract + shared Schemas (source of truth for the API)
```

## Commands

| Task | Command |
|---|---|
| Install | `pnpm install` |
| Dev (API + web) | `pnpm dev` |
| Lint / fix | `pnpm lint` / `pnpm lint:fix` |
| Typecheck | `pnpm typecheck` |
| Test | `pnpm test` |
| End-to-end test | `pnpm test:e2e` |
| Build | `pnpm build` |

Before calling work done, run lint, typecheck, test, build and test:e2e. All must pass.

`pnpm dev` runs through Turborepo in strict env mode: variables set in the shell (e.g. `PORT=3002 pnpm dev`) are dropped. Change them in the app's `.env` instead.

### Running tests

- Always run tests in single-run mode (`pnpm test` / `vitest run`), never watch mode.
- Timeouts are set in `apps/api/vitest.config.ts` (test 10s, hook 10s, teardown 5s). Keep them in any new Vitest config.
- Also bound the command itself (e.g. a shell or tool timeout) so a hung process cannot block the session.
- Tests use in-memory PGlite; never point tests at a real database.
- `pnpm test:e2e` (Playwright, `apps/web/e2e`) starts its own API (ports 3101/5174, in-memory PGlite) so it does not clash with `pnpm dev`; it needs Chromium once (`pnpm --filter @crm/web exec playwright install chromium`). `pnpm test` stays API-only.

## Language

- **UI text: Brazilian Portuguese** (screens, messages, `lang="pt-BR"`).
- **Everything else: English** (identifiers, comments, docs, commit messages).

## Code style

- Names must say what the value is: booleans read as questions (`usePglite`, `isReady`), promises end in `Promise`, React query results end in `Query`.
- Layers: `XxxLive` for production implementations, `TestLayer` (or `XxxTest`) in tests.
- No `any` and no type casts (`as`). Use `unknown` + narrowing, generics or Schema decoding.
- Relative imports use the `.ts` extension.
- Imports that would climb a directory use the package's `#src/` subpath alias (`#src/lib/auth.ts`); same-folder imports stay relative (`./x.ts`).
- Only erasable TypeScript syntax: no `enum`, `namespace` or parameter properties (Node runs the API's `.ts` files by stripping types). For closed sets of values use `Schema.Literals([...])` when the value crosses a boundary (contract, config, database) and a literal union or an `as const` object otherwise (`as const` is a const assertion, not a cast).
- Biome formats and lints; do not hand-format against it.
- Minimal, surgical changes. No speculative abstractions or features.

### Comments

Only comment when the code cannot speak for itself:

- **High complexity**: explain what a complex function does and why.
- **Intentional non-obvious logic**: something deliberately done differently from the usual way, with the reason.

Never comment what the code already says. Comments are always in English.

## Effect patterns

- **Contract first**: new or changed endpoints start in `packages/contract` (`HttpApiEndpoint` + `Schema`), then the API implements them with `HttpApiBuilder.group`, and the web calls them through `runApi` (`apps/web/src/lib/api-client.ts`).
- **Dependencies** are services provided by Layers. Resolve them when building the handler group, not inside each handler (see `apps/api/src/health/handlers.ts`).
- **Config**: read env vars only through `Config` in `apps/api/src/platform/config.ts`. Secrets use `Config.Redacted`. Every new variable also goes into the matching `.env.example` and the README table.
- **SQL**: use the `sql` template from `SqlClient`; one statement per call (multi-statement strings fail).
  - Queries live in the feature's repository service (`src/<feature>/repository.ts`, e.g. `AuthRepository`); handlers and middleware never write SQL. Migrations are the exception.
  - Build each query with `SqlSchema` (`findAll`, `findOneOption`, `void`) and `Request`/`Result` schemas so rows are decoded, never `sql<Row>`, which only asserts the row type. Tests that read rows decode them with `Schema` too.
- **Imports** come from `effect/unstable/*` in this RC. All Effect packages share one version via the pnpm catalog (`pnpm-workspace.yaml`); never pin them individually.

### Errors

- No `try/catch` in Effect code. Wrap throwing code with `Effect.try` and promises with `Effect.tryPromise`, mapping the cause to a typed error.
- Domain errors are `Schema.TaggedError` classes, handled with `Effect.catchTag` / `catchTags`.
- At the HTTP boundary, map internal errors to the errors declared in the contract (`HttpApiError.*` or contract error schemas) with `Effect.mapError`. Never leak raw database or library errors to clients.
- Use `Effect.orDie` only for failures that are truly unrecoverable bugs.

### Logging

- Use Effect's logger (`Effect.logInfo`, `logWarning`, `logError`, `logDebug`), never `console.*` in the API.
- Add context with `Effect.annotateLogs` (e.g. entity ids) instead of string interpolation.
- HTTP requests are already logged by the server; log domain events and failures, not every call.
- Never log secrets or personal data; `Redacted` values stay redacted.

## Web

- Routes are file-based in `apps/web/src/routes`. `routeTree.gen.ts` is generated; never edit it.
- Server state goes through TanStack Query with `queryFn: () => runApi((client) => ...)`.

## Workflow

- Work follows the steps in `TASKS.md`. One branch (`MM-DD/description`) and one PR per step.
- Before implementing a step, settle its "Open decisions" with the user; never pick them silently.
- Tick checklist items in `TASKS.md` as they are done, in the same commit as the work.
- When a step's PR is merged, tag the merge commit on `main` as `v0.<step>.0` (e.g. `v0.1.0` after step 1). Tags only mark milestones; they do not trigger deploys.

## Git

- `main` is protected: every change lands through a PR with the `check` CI job green. Never commit to `main` directly.
- Conventional commits, one line: `feat: add lead creation endpoint`.
- Never push or open a PR unless explicitly asked.
