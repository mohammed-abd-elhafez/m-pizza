# ADR-0002: Identity, authorization and online payments

**Status:** Accepted
**Date:** 2026-10-18
**Deciders:** Project owner

## Context
Customers order from a phone app without passwords; staff use shared kitchen tablets and an admin page; money moves through cash on delivery and, later, a card/wallet provider. The first version used one shared staff token and let anyone order for any phone number.

## Decision
- **Customers:** phone number + one-time code (6 digits, 5 min, max 5 guesses, max 3 codes per 10 min per phone). The code is stored only as an HMAC. The phone on an order always comes from the verified session, never the request body.
- **Sessions:** opaque random bearer tokens stored as SHA-256 hashes in `sessions`, revocable, 30 days (customers) / 12 hours (staff). No JWTs, so logout and deactivation take effect immediately.
- **Staff:** per-user accounts with scrypt-hashed passwords, roles `kitchen` and `admin`, optional branch scope. All permission checks go through `domain/policy.ts` (a Map, deny by default). Login errors are identical for unknown user, wrong password and disabled account, and the unknown-user path does equal work.
- **Order tracking** needs no account: each order has an unguessable `trackingToken` (UUID). Internal numeric ids are only shown to staff.
- **Idempotency:** `POST /orders` stores a fingerprint of the request next to the key; same key + same body replays, same key + different body is 409. A per-key advisory lock makes concurrent duplicates safe.
- **Payments:** the app never sees card data (hosted checkout). A `PaymentGateway` port hides the provider. An order is confirmed **only** by a signature-verified webhook whose amount equals the order total; the redirect back from the provider is never trusted. Settlement is idempotent (`UNIQUE(provider, provider_ref)` plus row locks). Online orders are hidden from the kitchen and cannot be accepted until `PAID`; the database enforces this too.
- **Database invariants:** legal status moves live in an `allowed_transitions` table checked by a trigger; audit tables are append-only (also against TRUNCATE); address ownership, topping/half relations, payment-method/status pairs are constraints.

## Options considered
| Option | Notes |
|---|---|
| Opaque DB sessions (chosen) | Revocable, simple, one lookup per request |
| JWT access + refresh tokens | Stateless, but revocation and rotation add moving parts we do not need at one-restaurant scale |
| Passwords for customers | Friction and reset flows; OTP matches how the market orders food |

## Consequences
- Easier: reasoning about who may do what; instant revocation; replay-safe checkout.
- Harder: needs an SMS provider before real customers can log in (the dev sender prints codes to the console, and the server refuses to start with it when `NODE_ENV=production`).
- To revisit: single-process live updates (`InMemoryOrderEvents`) must become Postgres LISTEN/NOTIFY or Redis before running more than one API instance; rate limits are per instance too.

## Security impact
New trust boundaries: SMS provider (sends codes), payment provider (signs webhooks). Secrets (`OTP_SECRET`, provider keys) only from the environment. The Paymob adapter is **not yet verified against a live account** (see its header comment).

## Rollout and exit
Create staff accounts with `npm run staff:upsert`. Production also needs: TLS-terminating proxy (`TRUST_PROXY_HOPS`), an application database role limited to SELECT/INSERT/UPDATE on the needed tables with migrations run by a separate owner role, and an SMS provider adapter implementing `OtpSender`.

## Action items
1. [ ] SMS provider adapter (`OtpSender`) and provider choice
2. [ ] Run the Paymob adapter against the sandbox; fix endpoint/field differences
3. [ ] Separate DB owner and application roles
4. [ ] Replace in-process event bus before scaling out
