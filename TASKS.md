# Tasks

The CRM grows in vertical slices. Each step ships database, API contract, API, web and tests together, and leaves the app deployed and working.

Every step:

- lives on its own branch (`MM-DD/description`) and lands through one PR;
- starts by settling its open product decisions;
- keeps lint, typecheck, tests and build green;
- updates the README when it adds setup, env vars or behavior worth documenting.

## 1. Authentication and sellers

A seller is the logged-in user; every deal will belong to one.

- [x] Migration mechanism with Effect `Migrator`, running on API startup (Postgres and PGlite)
- [x] `users` table and seed with sellers, including a demo user that also exists in production
- [x] Password hashing
- [x] Contract: login, logout and current-user endpoints with typed errors
- [x] Session in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie; CORS with credentials
- [x] Auth middleware protecting every non-public endpoint
- [x] Web: base layout and login screen (Figma), protected routes, logout
- [x] Tests: login success and failure, protected endpoint without a session
- [x] README: local demo credentials; production credentials shared on request

Open decisions: session storage (database table or signed token), roles (sellers only, or also a manager).

## 2. Leads

- [ ] `leads` table and migration
- [ ] Contract: create and list leads, with validation errors
- [ ] Web: lead list and create lead screens (Figma)
- [ ] Tests: create, list, validation failure

Open decisions: lead fields (name, email, phone, company, source), whether leads are shared or owned by a seller.

## 3. Deals and kanban

- [ ] `deals` table linked to a lead and a seller, with a status
- [ ] Contract: create deal, list deals by status, change status
- [ ] Web: create deal screen (Figma), kanban board with one column per status
- [ ] Move deals between columns (drag and drop, with a non-drag fallback)
- [ ] Tests: create, invalid lead, status transitions

Open decisions: status list and allowed transitions, deal fields (title, value, expected close date), whether won/lost are board columns.

## 4. Closing deals and details

- [ ] Contract: mark a deal as won or lost (closing is explicit and final)
- [ ] Web: deal details screen (Figma)
- [ ] From the kanban card: open details, mark as won or lost
- [ ] Tests: close as won, close as lost, reject changes to a closed deal

Open decisions: loss reason, whether a closed deal can be reopened.

## 5. Comments

- [ ] `comments` table for leads and deals, with author and timestamp
- [ ] Contract: add and list comments
- [ ] Web: comment history on lead and deal details
- [ ] From the kanban card: add a comment
- [ ] Tests: add, list, comment on a missing lead or deal

Open decisions: editing and deleting comments.

## 6. AI assistance

- [ ] Pick the feature: deal comment summary or next-step suggestion
- [ ] Effect AI with a provider layer; API key through `Config.Redacted`
- [ ] Contract and endpoint with typed errors (provider failure, missing data)
- [ ] Web: trigger and display on the deal details
- [ ] Tests with a mocked provider layer

Open decisions: which feature, which provider and model, cost and rate limits.

## 7. Release readiness

- [ ] README: concise "Technical decisions" section
- [ ] Review README setup steps from a clean clone
- [ ] Make the repository public
- [ ] Final check of the live app with the demo user
