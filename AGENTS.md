# AGENTS.md - M Pizza

Pizza ordering system for one Egyptian restaurant: customer app (Flutter), kitchen board and admin (static web), API (Node). Arabic-first, COD-first. Clean-room: no Dodo code, names, copy or images.

## Project facts
- API: `apps/api` - Node 24, TypeScript (strict), Fastify 4, zod 4, pg, vitest. PostgreSQL 17 (dev: portable binaries in `C:\dev\pgdata`, port 5432; start with `pg_ctl` from `C:\dev\pgdev\node_modules\@embedded-postgres\windows-x64\native\bin`).
- Staff web: `apps/staff-web/public` (plain ES modules, no build). Served by the API at `/staff/` with a strict CSP: no inline scripts or styles, all customer-supplied text goes through `textContent` (see `js/dom.js`; `h()` refuses `innerHTML`).
- Mobile: `apps/mobile` (Flutter, built against `docs/api.md`; see its README for release/security settings). SDK at `C:\dev\flutter`; only Chrome/web and tests can run here (no Android SDK). A release build requires an `https` API URL; test a local web build with `flutter build web --profile` and a static server on port 8080 (an allowed CORS origin).
- DB: `db/migrations/*.sql` (numbered, immutable once applied, no BEGIN/COMMIT: the runner wraps each file atomically), `db/seed/*.sql` (demo menu, loaded only into an empty DB).
- Two database roles: the API runs as the restricted `mpizza_app` (`DATABASE_URL`; grants in `db/ops/app_role.sql`, applied with `npm run db:app-role`), while migrations, seed, `staff:upsert` and tests use the owner (`MIGRATION_DATABASE_URL`). When you add a table or a column the API must write, add the grant to `db/ops/app_role.sql`; `test/pg-least-privilege.test.ts` runs the whole app under that role and checks destructive statements are denied.
- Secrets live only in `apps/api/.env.local` (git-ignored). Never print or commit them. `.env.example` has names only.
- Docs: `docs/api.md` (API contract), `docs/adr/` (decisions: 0001 stack, 0002 identity and payments).

## Commands (run in `apps/api`)
| Task | Command |
|---|---|
| Test + coverage (80% gate) | `npm test` |
| Typecheck | `npm run typecheck` |
| Create/upgrade DB, demo menu | `npm run db:migrate`, `npm run db:seed` |
| Wipe local DB and rebuild | `npm run db:reset` (refuses non-local hosts and production) |
| Create/update a staff account | `STAFF_PASSWORD=... npm run staff:upsert -- <username> <kitchen\|admin> [branchId]` |
| Dependency vulnerabilities (CI gate) | `npm run audit` |
| Create the restricted API database role | `APP_DB_PASSWORD=... npm run db:app-role` |
| Run API | `npm start` (127.0.0.1:3000; dev OTP codes print to its stderr) |

Integration tests create and drop a separate `mpizza_test` database; they skip when Postgres is unreachable.

## Architecture (dependency direction)
`http -> application -> domain`, `infra` implements the ports in `application/*-ports.ts`.
- `src/domain`: pure rules (pricing, order state machine, delivery zones, phone, role policy). No framework, DB or HTTP imports.
- `src/application`: use cases (`priceCart`, `placeOrder`, `transitionOrder`, OTP login, staff login, payments), `AppError` codes, ports.
- `src/infra`: Postgres adapters, crypto, migration runner, Paymob adapter, in-memory event bus.
- `src/http`: Fastify routes (`routes/*`), zod schemas, auth hooks, error mapping. Routes are registered as child plugins after rate-limit/websocket so those plugins see them.
- No `utils`/`common` folders; code lives in the module that owns its meaning.

## Hard rules
1. Money is integer piastres. The server recomputes every price from the catalog; request schemas are `.strict()` and never accept prices.
2. Order status changes only through `domain/order-state-machine` via `transitionOrder`; each change appends an `order_events` row. The database independently enforces legal moves (`allowed_transitions` + trigger) and append-only audit tables. Updates are compare-and-set on the previous status.
3. `POST /orders` needs a customer session and an `Idempotency-Key`; the phone comes from the session. Same key + same body replays; different body is 409.
4. Customers view an order only through its unguessable `trackingToken`. Internal ids are never returned to customers.
5. Staff authorization goes through `domain/policy.ts` (deny by default); admin writes are audited. Kitchen staff may be branch-scoped.
6. Online payments are confirmed only by a signature-verified webhook with a matching amount. The Paymob adapter is unverified against a live account.
7. Free text from customers and staff goes through `freeText()` (strips bidi/invisible/control characters, bounded). Validate at the boundary (zod), enforce invariants in the DB, never trust client input. Client errors carry fixed messages; no internals leak.
8. Tests first (RED -> GREEN -> refactor). New behaviour needs unit tests; anything touching SQL needs a real-Postgres integration test.
9. Stop for human review before deploying, changing credentials, destructive migrations, or turning on real payments/SMS.

## Operational hardening already in place
- Server timeouts (headers 10 s, request 15 s), DB `statement_timeout` 10 s and `idle_in_transaction_session_timeout` 15 s, pool error handler, fail-fast on unhandled rejections, 10 s shutdown cap.
- Security events (failed staff login, 401/403/429) are logged as structured JSON (`event: "security"`) without tokens, passwords or tracking tokens.
- CI (`.github/workflows/ci.yml`) runs typecheck, tests on real Postgres, `npm audit`, gitleaks and the Flutter checks; Dependabot opens weekly update PRs.

## Known gaps / next
- SMS provider for OTP (the server refuses `NODE_ENV=production` until one exists).
- Paymob sandbox run; Fawry or other providers.
- Production: TLS proxy (`TRUST_PROXY_HOPS`), separate DB owner/app roles, replace the in-process event bus and per-instance rate limits before running more than one API instance.
- Customer sessions are a flat 30 days: add sliding expiry and a "log out everywhere" endpoint. Add a global SMS-per-hour budget and per-country limits when the SMS provider is wired (SMS pumping).
- Partial refunds from the provider are not modelled (only full refunds/voids set `REFUNDED`); refunds themselves are done by staff in the provider dashboard, the system only flags them (`payments.status = needs_refund`, `audit_log` outcome `attention`).
- Admin accounts are global (the CLI refuses a branch for admins); only kitchen accounts are branch-scoped.
- Remove-topping should check it is a default topping of the item (`item_default_toppings`).
- Bulk-insert order rows and cache the catalog if order volume grows.

See `docs/adr/`.
