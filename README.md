# M Pizza | إم بيتزا

A pizza ordering system for a single Egyptian restaurant: a customer app (Arabic-first, RTL), a kitchen board and admin
web app, and the API behind them. Cash on delivery first, online payment ready behind a provider adapter.

**Live demo:** https://mohammed-abd-elhafez.github.io/m-pizza/ (an in-browser demo with a fake server: nothing is sent
anywhere and no real orders are placed. Any 6-digit code signs you in.)

## What is inside

| Folder | What |
|---|---|
| `apps/api` | Node 24 + TypeScript + Fastify 5 + PostgreSQL. Pricing, order state machine, OTP login, staff roles, payments webhook, admin, live tracking over WebSocket. 228 tests, including a suite that runs the whole app under a least-privilege database role. |
| `apps/mobile` | Flutter customer app (menu, half-and-half pizza customiser, cart priced by the server, OTP login, live order tracking, reorder). Arabic/English, RTL. 148 tests. |
| `apps/staff-web` | Kitchen board and admin pages (plain ES modules, strict CSP, no build step). Served by the API at `/staff/`. |
| `db` | Numbered SQL migrations, demo seed, least-privilege role definition. |
| `docs` | `api.md` (API contract) and architecture decision records. |

## Run it locally

You need Node 24, PostgreSQL 17 and (for the app) the Flutter SDK. Copy `apps/api/.env.example` to `apps/api/.env.local` and
fill in the values, then:

```bash
cd apps/api
npm ci
npm run db:reset        # creates the schema and loads the demo menu
npm test
npm start               # API on http://127.0.0.1:3000, staff pages on /staff/
```

```bash
cd apps/mobile
flutter pub get
flutter test
flutter run -d chrome --dart-define=API_BASE_URL=http://127.0.0.1:3000
# or the self-contained demo, no backend needed:
flutter run -d chrome --dart-define=DEMO=true
```

## Security notes

Money is integer piastres and always priced by the server; orders can only change status through the state machine (also
enforced by database triggers); payments are confirmed only by a signature-verified webhook; the API runs as a restricted
database role; dependencies are audited in CI. Details and open items are in `AGENTS.md` and `docs/adr/`.

## Status

Backend, staff web and the customer app are built and tested. Before real customers: an SMS provider for OTP, a Paymob sandbox
run, real menu and branch data, hosting with TLS, and the legal items listed in `AGENTS.md`.

## License

No license is granted: all rights reserved by the repository owner.
