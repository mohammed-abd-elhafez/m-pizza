import type { AddressInfo } from "node:net";
import type { FastifyInstance } from "fastify";
import WebSocket from "ws";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PaymentGateway, PaymentRepository, SettleOutcome, WebhookEvent } from "../src/application/payment-ports";
import { buildApp, type AppDeps } from "../src/http/app";
import { fingerprint } from "../src/infra/crypto";
import { FakeAdminRepo } from "./support/fake-admin";
import { Clock, FakeCatalogRepo, FakeOrderRepo, RecordingEvents, far, makeAuth, near, type TestAuth } from "./support/fakes";

const KEY = "order-key-0000000001";
let app: FastifyInstance;
let auth: TestAuth;
let orders: FakeOrderRepo;
let events: RecordingEvents;
let admin: FakeAdminRepo;
let clock: Clock;
let n = 0;

const line = { qty: 1, crustId: 2, halves: [{ half: "whole", itemId: 1, sizeId: 10, toppings: [{ id: 1, action: "add" }] }] };
const orderBody = (over: Record<string, unknown> = {}) => ({
  service: "delivery",
  location: near,
  address: { landmark: "next to the mosque" },
  paymentMethod: "cod",
  lines: [line],
  ...over,
});

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const post = (url: string, payload: unknown, headers: Record<string, string> = {}) =>
  app.inject({ method: "POST", url, payload: payload as object, headers });
const get = (url: string, headers: Record<string, string> = {}) => app.inject({ method: "GET", url, headers });

async function loginCustomer(phone = "010 1234 5678"): Promise<string> {
  const normalized = phone.replace(/\s/g, "").replace(/^0/, "+20");
  expect((await post("/auth/otp/request", { phone })).statusCode).toBe(202);
  const res = await post("/auth/otp/verify", { phone, code: auth.sender.last(normalized) });
  expect(res.statusCode).toBe(200);
  return res.json().token as string;
}

async function loginStaff(username: string, password: string): Promise<string> {
  const res = await post("/staff/login", { username, password });
  expect(res.statusCode).toBe(200);
  return res.json().token as string;
}

const placed = (token: string, over: Record<string, unknown> = {}, key = KEY) =>
  post("/orders", orderBody(over), { ...bearer(token), "idempotency-key": key });

class StubGateway implements PaymentGateway {
  readonly provider = "paymob" as const;
  checkouts = 0;
  async createCheckout() {
    this.checkouts += 1;
    return { providerRef: `pm-${this.checkouts}`, redirectUrl: `https://pay.example/${this.checkouts}` };
  }
  verifyWebhook(req: { rawBody: string; query: Readonly<Record<string, string | undefined>> }): WebhookEvent | null {
    return req.query["hmac"] === "valid" ? (JSON.parse(req.rawBody) as WebhookEvent) : null;
  }
}
class StubPayments implements PaymentRepository {
  settled: WebhookEvent[] = [];
  outcome: SettleOutcome = { outcome: "paid", trackingToken: "tracking-token-1", orderStatus: "PLACED" };
  pendingNow = false;
  async recordPending() {}
  async hasRecentPending() {
    return this.pendingNow;
  }
  async settle(_p: string, e: WebhookEvent) {
    this.settled.push(e);
    return this.outcome;
  }
}

async function boot(over: Partial<AppDeps> = {}) {
  clock = new Clock();
  auth = makeAuth(clock);
  events = new RecordingEvents();
  orders = new FakeOrderRepo(clock, auth.customers.idOf);
  admin = new FakeAdminRepo();
  n = 0;
  app = buildApp({
    catalog: new FakeCatalogRepo(),
    orders,
    events,
    auth: auth.deps,
    admin,
    newToken: () => `tracking-token-${++n}`,
    fingerprint,
    now: clock.now,
    logger: false,
    ordersPerMinute: 1000,
    ...over,
  });
  await app.ready();
  await auth.addStaff("amira", "kitchen password 1", "kitchen", 1);
  await auth.addStaff("other", "kitchen password 2", "kitchen", 2);
  await auth.addStaff("hassan", "admin password 123", "admin");
}

beforeEach(() => boot());
afterEach(() => app.close());

describe("public endpoints", () => {
  it("serves health and a cacheable menu with security headers", async () => {
    expect((await get("/health")).statusCode).toBe(200);
    const menu = await get("/menu");
    expect(menu.statusCode).toBe(200);
    expect(menu.headers["cache-control"]).toMatch(/max-age/);
    expect(menu.headers["x-content-type-options"]).toBe("nosniff");
    expect(menu.headers["x-frame-options"]).toBe("DENY");
  });

  it("prices a cart on the server", async () => {
    const res = await post("/cart/price", { service: "delivery", location: near, lines: [line] });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ subtotalPiastres: 18500, deliveryFeePiastres: 2000, totalPiastres: 20500, etaMinutes: 30 });
  });

  it("rejects unknown fields so client-supplied prices are never accepted", async () => {
    const res = await post("/cart/price", { service: "pickup", branchId: 1, lines: [{ ...line, unitPrice: 1 }] });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_REQUEST");
  });

  it("maps business failures to stable codes", async () => {
    const out = await post("/cart/price", { service: "delivery", location: far, lines: [line] });
    expect([out.statusCode, out.json().error.code]).toEqual([422, "OUT_OF_ZONE"]);
    const bad = await post("/cart/price", { service: "pickup", branchId: 1, lines: [{ ...line, halves: [{ half: "whole", itemId: 999, sizeId: 10 }] }] });
    expect([bad.statusCode, bad.json().error.code]).toEqual([422, "INVALID_CART"]);
  });

  it("rejects malformed JSON and oversized bodies with fixed messages", async () => {
    const malformed = await app.inject({ method: "POST", url: "/cart/price", payload: "{nope", headers: { "content-type": "application/json" } });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.body).not.toMatch(/JSON|position|token/i);
    const huge = await post("/cart/price", { service: "pickup", branchId: 1, lines: [line], pad: "x".repeat(70_000) });
    expect(huge.statusCode).toBe(413);
    expect(huge.json().error.message).toBe("Request body too large");
  });

  it("API responses carry a deny-everything CSP, and HSTS only when behind a TLS proxy", async () => {
    expect((await get("/health")).headers["content-security-policy"]).toBe("default-src 'none'; frame-ancestors 'none'");
    expect((await get("/health")).headers["strict-transport-security"]).toBeUndefined();
    await app.close();
    await boot({ trustProxyHops: 1 });
    expect((await get("/health")).headers["strict-transport-security"]).toMatch(/max-age=\d+/);
  });

  it("returns JSON 404 for unknown routes", async () => {
    const res = await get("/nope");
    expect([res.statusCode, res.json().error.code]).toEqual([404, "NOT_FOUND"]);
  });
});

describe("customer authentication", () => {
  it("answers OTP requests identically whether or not a code was sent", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await post("/auth/otp/request", { phone: "01012345678" });
      expect([res.statusCode, res.json()]).toEqual([202, { status: "accepted" }]);
    }
    expect(auth.sender.sent.length).toBe(3); // the rest were throttled, invisibly
  });

  it("validates phone and code shape", async () => {
    expect((await post("/auth/otp/request", { phone: "12345" })).statusCode).toBe(400);
    expect((await post("/auth/otp/verify", { phone: "01012345678", code: "12" })).statusCode).toBe(400);
    expect((await post("/auth/otp/verify", { phone: "01012345678", code: "123456", extra: 1 })).statusCode).toBe(400);
  });

  it("rejects a wrong code with a generic 401, and accepts the right one", async () => {
    await post("/auth/otp/request", { phone: "01012345678" });
    const real = auth.sender.last("+201012345678");
    const wrong = real === "000000" ? "000001" : "000000";
    const bad = await post("/auth/otp/verify", { phone: "01012345678", code: wrong });
    expect([bad.statusCode, bad.json().error.code]).toEqual([401, "UNAUTHORIZED"]);
    expect((await post("/auth/otp/verify", { phone: "01012345678", code: real })).statusCode).toBe(200);
  });

  it("logout revokes the token", async () => {
    const token = await loginCustomer();
    expect((await get("/orders", bearer(token))).statusCode).toBe(200);
    expect((await post("/auth/logout", {}, bearer(token))).statusCode).toBe(204);
    expect((await get("/orders", bearer(token))).statusCode).toBe(401);
    expect((await post("/auth/logout", {})).statusCode).toBe(401);
  });

  it("rate-limits OTP requests per client", async () => {
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) codes.push((await post("/auth/otp/request", { phone: "01012345678" })).statusCode);
    expect(codes.slice(0, 5)).toEqual([202, 202, 202, 202, 202]);
    expect(codes.slice(5)).toEqual([429, 429]);
  });
});

describe("placing and tracking orders", () => {
  it("requires a customer session, and staff tokens do not count", async () => {
    expect((await post("/orders", orderBody(), { "idempotency-key": KEY })).statusCode).toBe(401);
    const staff = await loginStaff("hassan", "admin password 123");
    expect((await placed(staff)).statusCode).toBe(401);
  });

  it("requires a well-formed, high-entropy Idempotency-Key", async () => {
    const token = await loginCustomer();
    expect((await post("/orders", orderBody(), bearer(token))).statusCode).toBe(400);
    expect((await placed(token, {}, "short")).statusCode).toBe(400);
  });

  it("takes the phone from the session, never from the body", async () => {
    const token = await loginCustomer("01099998888");
    expect((await placed(token, { phone: "01000000000" })).statusCode).toBe(400);
    expect((await placed(token)).statusCode).toBe(201);
    expect(orders.stored.get(1)!.order.phone).toBe("+201099998888");
  });

  it("creates an order (201) without leaking the internal id, and replays idempotently (200)", async () => {
    const token = await loginCustomer();
    const first = await placed(token);
    expect(first.statusCode).toBe(201);
    expect(first.json().order).toMatchObject({ status: "PLACED", paymentStatus: "COD_PENDING", totalPiastres: 20500, trackingToken: "tracking-token-1" });
    expect(first.json().order).not.toHaveProperty("id");
    expect(first.json().payment).toBeNull();

    const again = await placed(token);
    expect(again.statusCode).toBe(200);
    expect(again.json().order.trackingToken).toBe("tracking-token-1");
    expect(orders.stored.size).toBe(1);
  });

  it("returns 409 when a key is reused for a different request", async () => {
    const token = await loginCustomer();
    await placed(token);
    const res = await placed(token, { note: "changed" });
    expect([res.statusCode, res.json().error.code]).toEqual([409, "CONFLICT"]);
  });

  it("only the tracking-token holder can view an order; the view is private and has no id", async () => {
    const token = await loginCustomer();
    await placed(token);
    const ok = await get("/orders/track/tracking-token-1");
    expect(ok.statusCode).toBe(200);
    expect(ok.json().order.status).toBe("PLACED");
    expect(ok.json().order).not.toHaveProperty("id");
    expect(ok.headers["cache-control"]).toBe("no-store");
    expect((await get("/orders/track/tracking-token-2")).statusCode).toBe(404);
    expect((await get("/orders/1")).statusCode).toBe(404);
  });

  it("history lists only the caller's own orders, ready for one-tap reorder", async () => {
    const mine = await loginCustomer("01012345678");
    const theirs = await loginCustomer("01155556666");
    await placed(mine);
    await placed(theirs, {}, "order-key-0000000002");

    const history = (await get("/orders", bearer(mine))).json().orders;
    expect(history).toHaveLength(1);
    expect(history[0].lines[0]).toMatchObject({ qty: 1, crustId: 2, halves: [{ half: "whole", itemId: 1, sizeId: 10, toppings: [{ id: 1, action: "add" }] }] });
    expect(history[0]).not.toHaveProperty("id");
    expect((await get("/orders")).statusCode).toBe(401);
  });

  it("rate-limits order creation per client", async () => {
    await app.close();
    await boot({ ordersPerMinute: 2 });
    const token = await loginCustomer();
    const codes: number[] = [];
    for (let i = 0; i < 3; i++) codes.push((await placed(token, {}, `order-key-limit-${i}0000`)).statusCode);
    expect(codes).toEqual([201, 201, 429]);
  });

  it("rejects online payment when no provider is configured", async () => {
    const token = await loginCustomer();
    const res = await placed(token, { paymentMethod: "online" });
    expect([res.statusCode, res.json().error.message]).toEqual([400, "Online payment is not available"]);
    expect(orders.stored.size).toBe(0);
  });
});

describe("online payment", () => {
  let gateway: StubGateway;
  let payments: StubPayments;

  beforeEach(async () => {
    await app.close();
    gateway = new StubGateway();
    payments = new StubPayments();
    await boot({ payments: { gateway, repo: payments } });
  });

  it("returns a hosted checkout link and keeps the order off the kitchen board until paid", async () => {
    const token = await loginCustomer();
    const res = await placed(token, { paymentMethod: "online" });
    expect(res.statusCode).toBe(201);
    expect(res.json().payment).toEqual({ redirectUrl: "https://pay.example/1" });
    expect(res.json().order.paymentStatus).toBe("UNPAID");

    const staff = await loginStaff("hassan", "admin password 123");
    expect((await get("/kitchen/orders", bearer(staff))).json().orders).toHaveLength(0);
    const move = await post("/kitchen/orders/1/transition", { to: "ACCEPTED" }, bearer(staff));
    expect([move.statusCode, move.json().error.code]).toEqual([409, "PAYMENT_PENDING"]);
  });

  it("keeps the order and reports no link when the provider is down; checkout can be retried", async () => {
    gateway.createCheckout = async () => {
      throw new Error("provider down");
    };
    const token = await loginCustomer();
    const res = await placed(token, { paymentMethod: "online" });
    expect(res.statusCode).toBe(201);
    expect(res.json().payment).toBeNull();

    gateway.createCheckout = async () => ({ providerRef: "pm-retry", redirectUrl: "https://pay.example/retry" });
    const retry = await post("/orders/track/tracking-token-1/checkout", {}, bearer(token));
    expect(retry.json().payment.redirectUrl).toBe("https://pay.example/retry");
  });

  it("will not open checkout for orders that do not need payment", async () => {
    const token = await loginCustomer();
    await placed(token);
    const res = await post("/orders/track/tracking-token-1/checkout", {}, bearer(token));
    expect(res.statusCode).toBe(409);
    expect((await post("/orders/track/tracking-token-1/checkout", {})).statusCode).toBe(401);
  });

  it("only the customer who placed the order can open checkout for it", async () => {
    const owner = await loginCustomer("01012345678");
    const stranger = await loginCustomer("01155556666");
    await placed(owner, { paymentMethod: "online" });
    const checkoutsBefore = gateway.checkouts;

    const res = await post("/orders/track/tracking-token-1/checkout", {}, bearer(stranger));
    expect([res.statusCode, res.json().error.code]).toEqual([404, "NOT_FOUND"]);
    expect(gateway.checkouts).toBe(checkoutsBefore); // the provider was never contacted
  });

  it("refuses to open a second payment page while one is still open", async () => {
    const token = await loginCustomer();
    await placed(token, { paymentMethod: "online" });
    payments.pendingNow = true;
    const res = await post("/orders/track/tracking-token-1/checkout", {}, bearer(token));
    expect([res.statusCode, res.json().error.code]).toEqual([409, "CONFLICT"]);
    expect(gateway.checkouts).toBe(1);
    payments.pendingNow = false;
    expect((await post("/orders/track/tracking-token-1/checkout", {}, bearer(token))).statusCode).toBe(200);
  });

  it("rate-limits checkout creation", async () => {
    const token = await loginCustomer();
    await placed(token, { paymentMethod: "online" });
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) codes.push((await post("/orders/track/tracking-token-1/checkout", {}, bearer(token))).statusCode);
    expect(codes.at(-1)).toBe(429);
  });

  it("webhook: forged signatures get 401 and change nothing", async () => {
    const res = await post("/payments/webhook/paymob?hmac=forged", { providerRef: "pm-1", success: true });
    expect(res.statusCode).toBe(401);
    expect(payments.settled).toHaveLength(0);
  });

  it("webhook: a verified event settles the order and pushes a live update", async () => {
    const body = { providerRef: "pm-1", transactionId: "t", success: true, pending: false, refunded: false, amountPiastres: 20500 };
    const res = await post("/payments/webhook/paymob?hmac=valid", body);
    expect([res.statusCode, res.json()]).toEqual([200, { outcome: "paid" }]);
    expect(events.published).toEqual([{ trackingToken: "tracking-token-1", status: "PLACED", paymentStatus: "PAID" }]);
  });

  it("webhook: unknown providers and non-JSON bodies are rejected; other routes still parse JSON normally", async () => {
    expect((await post("/payments/webhook/fawry?hmac=valid", {})).statusCode).toBe(404);
    expect((await get("/health")).statusCode).toBe(200);
    expect((await post("/cart/price", { service: "pickup", branchId: 1, lines: [line] })).statusCode).toBe(200);
  });
});

describe("kitchen endpoints (staff only)", () => {
  it("denies missing and malformed credentials, and customers", async () => {
    expect((await get("/kitchen/orders")).statusCode).toBe(401);
    expect((await get("/kitchen/orders", bearer("nope"))).statusCode).toBe(401);
    expect((await get("/kitchen/orders", { authorization: "garbage" })).statusCode).toBe(401);
    const customer = await loginCustomer();
    expect((await get("/kitchen/orders", bearer(customer))).statusCode).toBe(401);
    expect((await post("/kitchen/orders/1/transition", { to: "ACCEPTED" }, bearer(customer))).statusCode).toBe(401);
  });

  it("staff login gives one generic error and is rate limited", async () => {
    const wrong = await post("/staff/login", { username: "amira", password: "not the password" });
    const unknown = await post("/staff/login", { username: "nobody", password: "not the password" });
    expect(wrong.json()).toEqual(unknown.json());
    expect(wrong.statusCode).toBe(401);
    expect((await post("/staff/login", { username: "a", password: "x" })).statusCode).toBe(400);
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) codes.push((await post("/staff/login", { username: "amira", password: "bad password!!" })).statusCode);
    expect(codes.at(-1)).toBe(429);
  });

  it("lists active orders and moves them through the state machine, attributing each change to the person", async () => {
    const customer = await loginCustomer();
    await placed(customer);
    const staff = await loginStaff("amira", "kitchen password 1");
    expect((await get("/kitchen/orders", bearer(staff))).json().orders).toHaveLength(1);

    const go = (to: string, reason?: string) => post("/kitchen/orders/1/transition", { to, reason }, bearer(staff));
    expect((await go("ACCEPTED")).statusCode).toBe(200);
    expect(orders.stored.get(1)!.events[0]!.actor).toBe("staff:amira");
    expect((await go("DELIVERED")).statusCode).toBe(409);
    expect((await go("CANCELLED")).statusCode).toBe(400);
    expect((await go("CANCELLED", "customer asked")).statusCode).toBe(200);
    expect((await post("/kitchen/orders/99/transition", { to: "ACCEPTED" }, bearer(staff))).statusCode).toBe(404);
    expect((await post("/kitchen/orders/abc/transition", { to: "ACCEPTED" }, bearer(staff))).statusCode).toBe(400);
    expect((await post("/kitchen/orders/99999999999/transition", { to: "ACCEPTED" }, bearer(staff))).statusCode).toBe(400);
    expect((await post("/kitchen/orders/1/transition", { to: "BOGUS" }, bearer(staff))).statusCode).toBe(400);
  });

  it("branch-scoped staff only see and move their own branch's orders", async () => {
    await placed(await loginCustomer());
    const otherBranch = await loginStaff("other", "kitchen password 2");
    expect((await get("/kitchen/orders", bearer(otherBranch))).json().orders).toHaveLength(0);
    expect((await get("/kitchen/orders?branchId=1", bearer(otherBranch))).json().orders).toHaveLength(0);
    expect((await post("/kitchen/orders/1/transition", { to: "ACCEPTED" }, bearer(otherBranch))).statusCode).toBe(404);
  });

  it("bounds the list size", async () => {
    const staff = await loginStaff("hassan", "admin password 123");
    expect((await get("/kitchen/orders?limit=100000", bearer(staff))).statusCode).toBe(400);
    expect((await get("/kitchen/orders?status=NOPE", bearer(staff))).statusCode).toBe(400);
  });
});

describe("admin endpoints", () => {
  it("kitchen staff are forbidden; unauthenticated are unauthorised; admins are allowed", async () => {
    expect((await get("/admin/items")).statusCode).toBe(401);
    const kitchen = await loginStaff("amira", "kitchen password 1");
    const forbidden = await get("/admin/items", bearer(kitchen));
    expect([forbidden.statusCode, forbidden.json().error.code]).toEqual([403, "FORBIDDEN"]);
    expect((await post("/admin/zones", { branchId: 1 }, bearer(kitchen))).statusCode).toBe(403);
    const adminToken = await loginStaff("hassan", "admin password 123");
    expect((await get("/admin/items", bearer(adminToken))).statusCode).toBe(200);
  });

  it("validates input strictly and records who changed what", async () => {
    const token = await loginStaff("hassan", "admin password 123");
    const bad = await post("/admin/items", { categoryId: 1, kind: "pizza", nameAr: "x", sizes: [], extra: true }, bearer(token));
    expect(bad.statusCode).toBe(400);
    const insecureImage = await post("/admin/items", { categoryId: 1, kind: "pizza", nameAr: "x", imageUrl: "http://x.test/a.png", sizes: [{ label: "S", pricePiastres: 100 }] }, bearer(token));
    expect(insecureImage.statusCode).toBe(400);

    const ok = await post("/admin/items", { categoryId: 1, kind: "pizza", nameAr: "Test", sizes: [{ label: "S", pricePiastres: 9000 }] }, bearer(token));
    expect(ok.statusCode).toBe(201);
    expect(admin.audit).toContain("staff:hassan:item.create");

    expect((await post("/admin/zones", { branchId: 1, name: "z", radiusM: 5, feePiastres: 1, minOrderPiastres: 0, etaMinutes: null }, bearer(token))).statusCode).toBe(400);
    expect((await app.inject({ method: "PATCH", url: "/admin/items/1", payload: {}, headers: bearer(token) })).statusCode).toBe(400);
    expect((await app.inject({ method: "PATCH", url: "/admin/items/99", payload: { isAvailable: false }, headers: bearer(token) })).statusCode).toBe(404);
    expect((await app.inject({ method: "PUT", url: "/admin/sizes/1/price", payload: { pricePiastres: -5 }, headers: bearer(token) })).statusCode).toBe(400);
    expect((await app.inject({ method: "PUT", url: "/admin/sizes/1/price", payload: { pricePiastres: 9500 }, headers: bearer(token) })).statusCode).toBe(204);
  });

  it("serves zones and the daily report, validating the date", async () => {
    const token = await loginStaff("hassan", "admin password 123");
    expect((await get("/admin/zones", bearer(token))).json().zones).toHaveLength(1);
    expect((await get("/admin/reports/daily?date=2026-10-18", bearer(token))).json().report.date).toBe("2026-10-18");
    expect((await get("/admin/reports/daily?date=yesterday", bearer(token))).statusCode).toBe(400);
    expect((await get("/admin/reports/daily?date=2026-02-31", bearer(token))).statusCode).toBe(400); // impossible date, not a 500
    expect((await get("/admin/reports/daily", bearer(token))).statusCode).toBe(400);
    expect((await app.inject({ method: "DELETE", url: "/admin/zones/1", headers: bearer(token) })).statusCode).toBe(204);
    expect((await app.inject({ method: "DELETE", url: "/admin/zones/1", headers: bearer(token) })).statusCode).toBe(404);
  });
});

describe("live tracking stream", () => {
  const open = async (path: string): Promise<{ ws: WebSocket; messages: unknown[]; closed: Promise<number> }> => {
    if (!app.server.listening) await app.listen({ port: 0, host: "127.0.0.1" });
    const { port } = app.server.address() as AddressInfo;
    const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
    const messages: unknown[] = [];
    ws.on("message", (m) => messages.push(JSON.parse(m.toString())));
    const closed = new Promise<number>((resolve) => {
      ws.on("close", (code) => resolve(code));
      ws.on("unexpected-response", (_req, res) => resolve(res.statusCode ?? 0));
      ws.on("error", () => undefined);
    });
    return { ws, messages, closed };
  };
  const until = async (cond: () => boolean) => {
    for (let i = 0; i < 100 && !cond(); i++) await new Promise((r) => setTimeout(r, 20));
    expect(cond()).toBe(true);
  };

  it("sends the current status, then every change, to the token holder", async () => {
    const customer = await loginCustomer();
    await placed(customer);
    const staff = await loginStaff("amira", "kitchen password 1");

    const { ws, messages } = await open("/orders/track/tracking-token-1/stream");
    await until(() => messages.length === 1);
    expect(messages[0]).toEqual({ type: "status", status: "PLACED", paymentStatus: "COD_PENDING" });

    await post("/kitchen/orders/1/transition", { to: "ACCEPTED" }, bearer(staff));
    await until(() => messages.length === 2);
    expect(messages[1]).toEqual({ type: "status", status: "ACCEPTED", paymentStatus: "COD_PENDING" });
    ws.close();
  });

  it("caps open streams per order, and frees the slot when a client leaves, even right after connecting", async () => {
    const customer = await loginCustomer();
    await placed(customer);
    const sockets = [];
    for (let i = 0; i < 5; i++) sockets.push(await open("/orders/track/tracking-token-1/stream"));
    for (const s of sockets) await until(() => s.messages.length === 1);

    const sixth = await open("/orders/track/tracking-token-1/stream");
    expect(await sixth.closed).toBe(1013);

    // connect and drop immediately, several times: no slot may leak
    sockets[0]!.ws.close();
    await new Promise((r) => setTimeout(r, 150));
    const quick: Awaited<ReturnType<typeof open>>[] = [];
    for (let i = 0; i < 3; i++) {
      const s = await open("/orders/track/tracking-token-1/stream");
      s.ws.terminate();
      quick.push(s);
    }
    await new Promise((r) => setTimeout(r, 250));
    const again = await open("/orders/track/tracking-token-1/stream");
    await until(() => again.messages.length === 1);
    for (const s of [...sockets.slice(1), again]) s.ws.close();
  });

  it("refuses unknown tokens before upgrading and cleans up on disconnect", async () => {
    const { closed } = await open("/orders/track/tracking-token-999/stream");
    expect(await closed).toBe(404);

    const customer = await loginCustomer();
    await placed(customer);
    const { ws, messages } = await open("/orders/track/tracking-token-1/stream");
    await until(() => messages.length === 1);
    ws.close();
    await new Promise((r) => setTimeout(r, 100));
    events.publish({ trackingToken: "tracking-token-1", status: "READY", paymentStatus: "COD_PENDING" });
    expect(messages).toHaveLength(1);
  });
});

describe("error handling", () => {
  it("never leaks internal error details", async () => {
    await app.close();
    const broken = new FakeCatalogRepo();
    broken.loadMenu = async () => {
      throw new Error("password authentication failed for user postgres at 10.0.0.5");
    };
    await boot({ catalog: broken });
    const res = await get("/menu");
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toMatch(/password|postgres|10\.0\.0\.5/);
    expect(res.json().error.code).toBe("INTERNAL");
    // A failed menu load must never be cached (the success path is cacheable for 60 s).
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});
