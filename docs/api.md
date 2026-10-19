# M Pizza API contract

Base URL (dev): `http://127.0.0.1:3000`. JSON everywhere. All money is **integer piastres** (1 EGP = 100). The server recomputes every price; clients never send prices (unknown fields are rejected with 400).

## Conventions

- **Errors:** `{ "error": { "code": "...", "message": "...", "fields"?: ["path"] } }`. Codes and HTTP status:
  `INVALID_REQUEST` 400 · `UNAUTHORIZED` 401 · `FORBIDDEN` 403 · `NOT_FOUND` 404 · `CONFLICT` 409 · `ILLEGAL_TRANSITION` 409 · `PAYMENT_PENDING` 409 · `INVALID_CART` 422 · `OUT_OF_ZONE` 422 · `BELOW_MINIMUM` 422 · `BRANCH_UNAVAILABLE` 422 · `RATE_LIMITED` 429 · `INTERNAL` 500. Framework errors use `BAD_REQUEST` with 400/413/415/429.
- **Auth:** `Authorization: Bearer <token>`. Customer and staff tokens are different and not interchangeable.
- **Rate limits** return 429; honour `retry-after`.
- **Idempotency:** `POST /orders` requires header `Idempotency-Key` (16-64 chars of `A-Za-z0-9_-`, use a UUID). Generate it once per checkout attempt and reuse it on retries: same key + same body returns the original order (200); same key + different body is `409 CONFLICT`.
- **Phone numbers:** Egyptian mobiles, `01012345678`, `+201012345678` or Arabic digits are accepted; stored as `+201XXXXXXXXX`.

## Customer authentication (OTP)

| Call | Body | Response |
|---|---|---|
| `POST /auth/otp/request` | `{ phone }` | `202 { status: "accepted" }` always (also when throttled: max 3 codes / 10 min / phone) |
| `POST /auth/otp/verify` | `{ phone, code }` (6 digits) | `200 { token, expiresAt, phone }`; wrong/expired/used code: generic `401`. Max 5 guesses per code, code valid 5 min; a phone is locked for 24 h after 10 wrong guesses in total, however many codes it requests |
| `POST /auth/logout` | - (Bearer) | `204`, token revoked |

Customer tokens last 30 days. In development the code is printed on the API server console as `[dev-otp] code for +20...: 123456` (no SMS provider yet).

## Menu and pricing (public)

- `GET /menu` ->
  `{ categories: [{ id, nameAr, nameEn, items: [{ id, kind: "pizza"|"side"|"drink"|"dessert", nameAr, nameEn, descriptionAr, descriptionEn, imageUrl, sizes: [{ id, label, pricePiastres }] }] }], crusts: [{ id, nameAr, nameEn, priceDeltaPiastres }], toppings: [{ id, nameAr, nameEn, priceDeltaPiastres }] }`.
  Size `label`s are `S`/`M`/`L` for pizzas and `regular` for everything else; localise them in the UI. Cacheable for 60 s.
- `POST /cart/price` -> body is a *cart* (below) without payment/address; returns
  `{ subtotalPiastres, deliveryFeePiastres, totalPiastres, minOrderPiastres, etaMinutes|null, lines: [{ unitPiastres, totalPiastres }] }`.

### Cart shape

```json
{
  "service": "delivery",                      // or "pickup"
  "location": { "lat": 30.05, "lng": 31.23 }, // delivery only
  "branchId": 1,                               // pickup only
  "lines": [{
    "qty": 1,                                  // 1..50
    "crustId": 3,                              // pizza only, optional
    "note": "well done",                       // optional, <= 200
    "halves": [                                // exactly 1 {half:"whole"} or 2 {left,right}
      { "half": "left",  "itemId": 2, "sizeId": 5, "toppings": [{ "id": 1, "action": "add" }] },
      { "half": "right", "itemId": 3, "sizeId": 8, "toppings": [{ "id": 3, "action": "remove" }] }
    ]
  }]
}
```

Rules enforced server-side: half-and-half is pizza-only, both halves must have the same size label, price = the higher half + crust + each half's added toppings; no duplicate topping ids in a half; <= 60 units and <= 5,000 EGP per order; delivery needs a location inside a zone and at least the zone minimum.

## Orders (customer, Bearer required unless noted)

- `POST /orders` (+ `Idempotency-Key`) body = cart + `{ address?, paymentMethod: "cod"|"online", note? }`
  - `address` (delivery only, required): `{ landmark (3-200), building?, floor?, apartment?, notes? }`. The phone comes from the session.
  - `201` (or `200` on replay): `{ order: { trackingToken, status, paymentStatus, totalPiastres }, payment: { redirectUrl } | null }`.
  - `online`: open `payment.redirectUrl` (hosted checkout). If `payment` is `null` call `POST /orders/track/:token/checkout`. Online payment returns 400 `Online payment is not available` until a provider is configured.
  - Max 10 orders per phone per hour (`RATE_LIMITED`).
- `GET /orders` -> `{ orders: [{ trackingToken, status, paymentStatus, service, totalPiastres, createdAt, lines: [cart-line shape with crustId] }] }` (latest 20). `lines` can be sent straight back to `/cart/price` for one-tap reorder.
- `GET /orders/track/:token` (**no auth**, the token is the capability) -> `{ order: { trackingToken, status, paymentStatus, totalPiastres, service, subtotalPiastres, deliveryFeePiastres, branchPhone, createdAt } }`.
- `POST /orders/track/:token/checkout` (Bearer, must be the customer who placed the order; 5/min) -> `{ payment: { redirectUrl } }` for an unpaid online order. `409 CONFLICT` while a recent checkout for the order is still open. Unpaid online orders are cancelled automatically after 60 minutes.
- **Live updates:** WebSocket `ws://host/orders/track/:token/stream` (no auth). Messages: `{ "type": "status", "status": "...", "paymentStatus": "..." }` - one immediately, then one per change. Max 5 streams per order. Fall back to polling `GET /orders/track/:token` every 10 s if the socket drops.

### Statuses

`PLACED -> ACCEPTED -> PREPARING -> READY -> OUT_FOR_DELIVERY -> DELIVERED` (delivery) or `READY -> PICKED_UP` (pickup); any non-final state can go to `CANCELLED`. Payment: `COD_PENDING | COD_COLLECTED` for cash, `UNPAID | PAID | REFUNDED` for online. Online orders stay hidden from the kitchen until `PAID`.

## Staff

`POST /staff/login { username, password (12+ chars) } -> { token, expiresAt, role }` (role `kitchen` or `admin`, 12 h sessions, 5 attempts/min per client, and an account locks for 15 min after 10 failures; the lock answers exactly like a wrong password). Branch-scoped kitchen accounts only see their branch.

- **Kitchen** (`kitchen` or `admin`): `GET /kitchen/orders?status=PLACED,ACCEPTED&branchId=&limit=100` (max 200) -> `{ orders: [{ id, status, service, paymentMethod, paymentStatus, totalPiastres, note, statusSince, lines: [{ qty, note, crust, halves: [{ half, item, size, toppings: [{ name, action }] }] }] }] }`; `POST /kitchen/orders/:id/transition { to, reason? }` (`reason` required for `CANCELLED`).
- **Admin** (`admin` only): `GET/POST/PATCH /admin/items`, `PUT /admin/sizes/:id/price`, `GET /admin/toppings`, `PUT /admin/toppings/:id/{price|availability}`, `GET /admin/crusts`, `PUT /admin/crusts/:id/price`, `GET/POST/PATCH/DELETE /admin/zones`, `GET /admin/branches`, `PUT /admin/branches/:id/open`, `GET /admin/orders?date=&status=&limit=`, `GET /admin/reports/daily?date=YYYY-MM-DD` (Africa/Cairo day) -> `{ report: { date, orders: {status: n}, revenuePiastres, cod: { expectedPiastres, collectedPiastres, outstandingPiastres }, online: { paidPiastres, refundDuePiastres } } }` (`refundDuePiastres` = money received for orders that were cancelled or paid twice and must be returned; each case is also written to `audit_log` with outcome `attention`). Every write is recorded in `audit_log`.

## Payments and Paymob webhook

When Paymob is configured, the current integration uses the Egypt Intention API with Unified Checkout. `PAYMOB_PAYMENT_METHOD_IDS` can contain more than one Test Integration ID, allowing the hosted checkout to expose the enabled card, wallet or other methods for the merchant account. The older Classic Accept iframe flow remains available only with `PAYMOB_MODE=classic`.

`POST /payments/webhook/paymob?hmac=...` is called by Paymob's server and must be reachable through a public HTTPS URL configured as `PAYMOB_NOTIFICATION_URL`; localhost cannot receive provider callbacks. The callback is authenticated by HMAC-SHA512, and replays/duplicates are harmless. The order is marked `PAID` only if the signature verifies and the amount equals the order total. Browser redirects are for user experience only and are never trusted for payment state. See `apps/api/src/infra/paymob.ts`; a real merchant Sandbox callback still needs to be verified with the owner's Paymob Test credentials.

## Staff web

`/staff/` serves the kitchen board and admin pages (same origin as the API, strict CSP).
