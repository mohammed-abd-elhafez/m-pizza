# ADR-0001: Stack and layering

**Status:** Accepted
**Date:** 2026-10-18
**Deciders:** Project owner

## Context
M Pizza is a pizza ordering system (customer app, kitchen board, admin) for one real Egyptian restaurant. Solo build, ~30 days to a pilot. Money correctness and order-state integrity matter most.

## Decision
- Backend: Node + TypeScript + Fastify, PostgreSQL. Flutter for the customer app; a small web app for kitchen/admin.
- Dependency direction: `http -> application -> domain <- infra (ports/adapters)`. `src/domain` imports nothing (no framework, DB or HTTP).
- Money is integer piastres. Prices are recomputed server-side from the catalog; client prices are never trusted.
- Order status changes only through `domain/order-state-machine`; every change writes an append-only `order_events` row.

## Options considered
| Option | Complexity | Notes |
|---|---|---|
| Node + Postgres + Flutter (chosen) | Med | One language on the server, real mobile app, relational model fits orders/modifiers |
| FastAPI + Postgres | Med | Equivalent, but splits the language with the web staff app |
| Firebase-style BaaS | Low | Weaker fit for server-side price validation and the state machine |

## Consequences
- Easier: unit-testing pricing and states with no I/O; swapping SMS/payment providers behind ports.
- Harder: more up-front structure than a CRUD scaffold.
- Revisit: realtime transport (WebSocket vs polling) and hosting once a pilot branch exists.

## Security impact
Trust boundaries: client/API, API/DB, API/payment-provider webhook. See `AGENTS.md` rules; webhooks are signature-verified and idempotent (`UNIQUE(provider, provider_ref)`).

## Action items
1. [ ] Fastify composition root and ports (`MenuRepository`, `OrderRepository`, `OtpProvider`, `PaymentGateway`)
2. [ ] Integration tests against real Postgres
3. [ ] Decide production Postgres hosting
