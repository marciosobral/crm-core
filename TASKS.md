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
- [x] Web: base layout and login screen (design), protected routes, logout
- [x] Tests: login success and failure, protected endpoint without a session
- [x] README: local demo credentials; production credentials shared on request

Open decisions: session storage (database table or signed token), roles (sellers only, or also a manager).

## 2. Leads

- [x] Roles (supervisor, seller) mapped to permissions; permissions checked by the API and exposed to the web
- [x] `leads` table and migration
- [x] Contract: create and list leads, with validation errors; list sellers
- [x] Sellers see only their own leads; supervisors see all and assign the responsible seller
- [x] Web: lead list (search, seller filter) and create lead screens (design)
- [x] Tests: create, list, validation failure, permissions

Open decisions: lead fields (name, email, phone, company, source), whether leads are shared or owned by a seller.

## 3. Deals and kanban

- [x] `deals` table linked to a lead and a seller, with a status
- [x] Contract: create deal, list deals by status, change status
- [x] Web: create deal screen (design), kanban board with one column per status
- [x] Move deals between columns (drag and drop, with a non-drag fallback)
- [x] Lead status derived from its deals (no deal: "Novo"), with a column and filter in the lead list
- [x] Tests: create, invalid lead, status transitions

Decisions: statuses Novo, Contato Feito, Proposta Enviada, Negociação (open, free movement) and Ganho, Perdido (closed, set in step 4); the Fechado column groups won and lost deals. Fields: title, linked lead, value (cents), responsible seller (prefilled with the lead's seller, supervisors may change it), initial status, expected close date, description.

## 4. Closing deals and details

- [x] Contract: mark a deal as won or lost (closing is explicit and final)
- [x] Web: deal details screen (design)
- [x] From the kanban card: open details, mark as won or lost
- [x] Tests: close as won, close as lost, reject changes to a closed deal

Decisions: a loss needs a reason from a closed set (price, competitor, no budget, no response, gave up, other) with an optional detail, required for "other"; closing is final, with no reopening; details open in a board side panel and on a full page; deals close from the details, the card menu or a drop on the Fechado column.

## 5. Comments

- [x] `deal_comments` and `deal_events` tables, with author and timestamp
- [x] Contract: add a comment and list a deal's activity (comments and events)
- [x] Web: activity timeline on the deal details
- [x] From the kanban card: add a comment
- [x] Lead list: last interaction column
- [x] Tests: add, list, comment on a missing deal, events on create, move and close

Decisions: comments live on deals only; the timeline mixes comments with system events (created, seller assigned, status changed, won, lost); comments are immutable, with no editing or deleting; the last interaction is the newest comment or event across a lead's deals.

## 6. AI assistance

- [x] Pick the feature: deal comment summary or next-step suggestion
- [x] Effect AI with a provider layer; API key through `Config.Redacted`
- [x] Contract and endpoint with typed errors (provider failure, missing data)
- [x] Web: trigger and display on the deal details
- [x] Tests with a mocked provider layer
- [x] Record AI usage per user (tokens, model, outcome) in `ai_usage`

Decisions: next-step suggestion on open deals; provider-agnostic `LanguageModel` with OpenAI (`gpt-6-luna` by default) as the only provider; optional key (503 without it); on demand, 5 per user per minute; reasoning effort `low` by default (`AI_REASONING_EFFORT`); suggestions are not persisted; every model call is recorded in `ai_usage`, queried with SQL (no screen).

## 7. AI assistant

- [x] Global chat on every logged-in screen: floating button, floating card with history list and new conversation
- [x] Tools over deals, leads and sales, always within the user's scope
- [x] Links to the filtered board and lead list, and to the screens that do what the user asks
- [x] Conversation history with a rolling summary and a window of recent messages
- [x] Suggested questions based on the data the user can see
- [x] Capability awareness: answers, explains how to do it in the CRM, or says the feature does not exist
- [x] Eval of tool, how-to and unsupported questions against the real model (not in CI)

Decisions: tools instead of RAG, so numbers are exact and permission scoped; up to 4 model steps per message; no streaming; links built by the server and rendered as buttons; the model never writes URLs; conversations persisted (last 12 messages plus summary, compaction from 16 unsummarized); `assistant.chat` permission for both roles; 10 messages per user per minute; every model call recorded in `ai_usage`; the next-step suggestion stays on the deal panel.

## 8. Release readiness

- [x] Web tests for the main flows (login, create lead)
- [ ] README: concise "Technical decisions" section
- [ ] Review README setup steps from a clean clone
- [ ] Make the repository public
- [ ] Final check of the live app with the demo user

## Out of scope

Not planned; revisit only if needed.

- Editing and deleting leads
- Pagination of the lead list
- A sellers management screen (sellers come from the seed)
- A dashboard screen (the design only shows its menu item, not the screen)
- Editing and deleting deals
- Manual ordering of deals inside a board column (newest first)
- Pagination or virtualization of the board columns
- Demo deals in the seed
- Reopening a closed deal
