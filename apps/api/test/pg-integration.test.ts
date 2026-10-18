import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requestOtp, verifyOtp } from "../src/application/customer-auth";
import { AppError } from "../src/application/errors";
import { placeOrder, type PlaceOrderDeps, type PlaceOrderInput } from "../src/application/place-order";
import type { WebhookEvent } from "../src/application/payment-ports";
import { authenticateCustomer, authenticateStaff, logout } from "../src/application/sessions";
import { staffLogin } from "../src/application/staff-login";
import { transitionOrder } from "../src/application/transition-order";
import { NodeSecretService, fingerprint } from "../src/infra/crypto";
import { InMemoryOrderEvents } from "../src/infra/event-bus";
import { migrate } from "../src/infra/migrate";
import { CapturingOtpSender } from "../src/infra/otp-senders";
import { PgAdminRepo } from "../src/infra/pg-admin";
import { PgCustomerRepo, PgOtpRepo, PgSessionRepo, PgStaffRepo } from "../src/infra/pg-auth";
import { PgCatalogRepo } from "../src/infra/pg-catalog";
import { PgOrderRepo } from "../src/infra/pg-orders";
import { PgPaymentRepo } from "../src/infra/pg-payments";
import { OTP_SECRET } from "./support/fakes";
import { MIGRATIONS_DIR, createTestPool } from "./support/test-db";

let pool: Pool | null = null;
let deps: PlaceOrderDeps;
let orders: PgOrderRepo;
let payments: PgPaymentRepo;
let admin: PgAdminRepo;
const events = new InMemoryOrderEvents();
const transitionDeps = () => ({ orders, events });

const nearBranch = { lat: 30.0444 + 0.009, lng: 31.2357 };
let phoneSeq = 0;
const newPhone = (): string => `+2010${String(10_000_000 + ++phoneSeq).padStart(8, "0")}`;

async function one<T = number>(sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await pool!.query(sql, params);
  return Object.values(rows[0] as Record<string, T>)[0]!;
}
const idOf = (table: "items" | "toppings" | "crusts", nameEn: string) => one<number>(`SELECT id FROM ${table} WHERE name_en = $1`, [nameEn]);
const sizeId = (itemId: number, label: string) => one<number>("SELECT id FROM item_sizes WHERE item_id=$1 AND label=$2", [itemId, label]);
const count = async (sql: string, params: unknown[] = []) => Number(await one<string>(sql, params));

const base = (over: Partial<PlaceOrderInput> = {}): PlaceOrderInput => ({
  phone: newPhone(),
  idempotencyKey: randomUUID(),
  service: "delivery",
  location: nearBranch,
  address: { landmark: "next to the mosque", building: "5", floor: "2", apartment: "4" },
  paymentMethod: "cod",
  lines: [],
  ...over,
});

async function simpleLine(qty = 1) {
  const pepperoni = await idOf("items", "Pepperoni");
  return { qty, crustId: await idOf("crusts", "Classic"), halves: [{ half: "whole" as const, itemId: pepperoni, sizeId: await sizeId(pepperoni, "L"), toppings: [] }] };
}

async function newOrder(over: Partial<PlaceOrderInput> = {}) {
  const input = base({ lines: [await simpleLine()], ...over });
  const { order } = await placeOrder(deps, input);
  return { order, input };
}

beforeAll(async () => {
  pool = await createTestPool();
  if (!pool) return;
  orders = new PgOrderRepo(pool);
  payments = new PgPaymentRepo(pool);
  admin = new PgAdminRepo(pool);
  deps = { catalog: new PgCatalogRepo(pool), orders, newToken: randomUUID, fingerprint, now: () => new Date() };
}, 60_000);

afterAll(async () => {
  await pool?.end();
});

const run = (name: string, fn: () => Promise<void>) =>
  it(name, async (ctx) => {
    if (!pool) return ctx.skip();
    await fn();
  });

const rejects = async (sql: string, params: unknown[], pattern: RegExp) => {
  await expect(pool!.query(sql, params)).rejects.toThrow(pattern);
};

describe("migrations", () => {
  run("are idempotent", async () => {
    expect(await migrate(pool!, MIGRATIONS_DIR)).toEqual([]);
  });

  run("apply atomically: a failing file leaves no trace and is not recorded", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mig-"));
    try {
      await writeFile(join(dir, "9001_ok.sql"), "CREATE TABLE mig_probe (id INT);\nINSERT INTO mig_probe VALUES (1);\nSELECT 1/0;\n");
      await expect(migrate(pool!, dir)).rejects.toThrow(/9001_ok.sql failed/);
      expect(await one<string | null>("SELECT to_regclass('public.mig_probe')")).toBeNull();
      expect(await count("SELECT count(*) FROM schema_migrations WHERE name = '9001_ok.sql'")).toBe(0);
      await expect(migrate(pool!, MIGRATIONS_DIR)).resolves.toEqual([]); // the pool is still healthy
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("catalog and ordering", () => {
  run("loads the seeded menu", async () => {
    const menu = await deps.catalog.loadMenu();
    expect(menu.categories.map((c) => c.nameEn)).toEqual(["Pizza", "Sides", "Drinks", "Desserts"]);
    const pepperoni = menu.categories[0]!.items.find((i) => i.nameEn === "Pepperoni")!;
    expect(pepperoni.sizes.map((s) => s.label)).toEqual(["S", "M", "L"]);
    expect(menu.crusts).toHaveLength(3);
  });

  run("places a half-and-half delivery order priced by the server, and shows both halves to the kitchen", async () => {
    const pep = await idOf("items", "Pepperoni");
    const sup = await idOf("items", "Supreme");
    const cheese = await idOf("toppings", "Extra cheese");
    const olives = await idOf("toppings", "Olives");
    const stuffed = await idOf("crusts", "Cheese-stuffed");
    const { order } = await placeOrder(
      deps,
      base({
        lines: [{
          qty: 2, crustId: stuffed, note: "well done",
          halves: [
            { half: "left", itemId: pep, sizeId: await sizeId(pep, "M"), toppings: [{ id: cheese, action: "add" }] },
            { half: "right", itemId: sup, sizeId: await sizeId(sup, "M"), toppings: [{ id: olives, action: "remove" }] },
          ],
        }],
      }),
    );
    // unit = max(12500, 13500) + 2500 crust + 1500 cheese = 17500; x2 = 35000; zone "near" fee 1500
    expect(order).toMatchObject({ status: "PLACED", paymentStatus: "COD_PENDING", totalPiastres: 36500 });

    const view = (await orders.listByStatuses(["PLACED"], { limit: 200 })).find((o) => o.id === order.id)!;
    expect(view.lines[0]).toMatchObject({ qty: 2, note: "well done" });
    expect(view.lines[0]!.halves.map((h) => h.half).sort()).toEqual(["left", "right"]);
    expect(view.lines[0]!.halves.find((h) => h.half === "left")!.toppings).toHaveLength(1);
    expect(view.lines[0]!.halves.find((h) => h.half === "right")!.toppings[0]!.action).toBe("remove");
    expect(await orders.findByToken(order.trackingToken)).toMatchObject({ id: order.id, service: "delivery", deliveryFeePiastres: 1500 });
    expect(await orders.findByToken("does-not-exist")).toBeNull();
  });

  run("concurrent identical requests create exactly one order", async () => {
    const input = base({ lines: [await simpleLine()] });
    const before = await count("SELECT count(*) FROM orders");
    const results = await Promise.all([placeOrder(deps, input), placeOrder(deps, input), placeOrder(deps, input)]);
    expect(new Set(results.map((r) => r.order.id)).size).toBe(1);
    expect(results.filter((r) => !r.replayed)).toHaveLength(1);
    expect(await count("SELECT count(*) FROM orders")).toBe(before + 1);
  });

  run("a reused key with a different body is refused, even concurrently, and nothing is stored twice", async () => {
    const input = base({ lines: [await simpleLine()] });
    await placeOrder(deps, input);
    const different = { ...input, lines: [await simpleLine(2)] };
    const settled = await Promise.allSettled([placeOrder(deps, different), placeOrder(deps, different)]);
    for (const s of settled) {
      expect(s.status).toBe("rejected");
      expect(((s as PromiseRejectedResult).reason as AppError).code).toBe("CONFLICT");
    }
    expect(await count("SELECT count(*) FROM orders o JOIN customers c ON c.id=o.customer_id WHERE c.phone=$1", [input.phone])).toBe(1);
  });

  run("a replay still returns the original order after the item became unavailable", async () => {
    const input = base({ lines: [await simpleLine()] });
    const first = await placeOrder(deps, input);
    await pool!.query("UPDATE items SET is_available = FALSE WHERE name_en = 'Pepperoni'");
    try {
      const again = await placeOrder(deps, input);
      expect(again).toMatchObject({ replayed: true, order: { id: first.order.id } });
      await expect(placeOrder(deps, { ...input, idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: "INVALID_CART" });
    } finally {
      await pool!.query("UPDATE items SET is_available = TRUE WHERE name_en = 'Pepperoni'");
    }
  });

  run("history is per customer and reorder-shaped", async () => {
    const phone = newPhone();
    const { order } = await newOrder({ phone });
    await newOrder({ phone: newPhone() });
    const customer = await new PgCustomerRepo(pool!).upsertByPhone(phone);
    const history = await orders.listForCustomer(customer.id, 20);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ trackingToken: order.trackingToken, service: "delivery" });
    expect(history[0]!.lines[0]!.halves[0]).toMatchObject({ half: "whole", toppings: [] });
  });

  run("counts a customer's recent orders", async () => {
    const phone = newPhone();
    await newOrder({ phone });
    await newOrder({ phone });
    expect(await orders.countSince(phone, new Date(Date.now() - 3_600_000))).toBe(2);
    expect(await orders.countSince(phone, new Date(Date.now() + 60_000))).toBe(0);
  });
});

describe("state machine against the database", () => {
  run("walks an order to DELIVERED, recording events; COD is collected", async () => {
    const { order } = await newOrder();
    for (const to of ["ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED"] as const) {
      await transitionOrder(transitionDeps(), { orderId: order.id, to, actor: "staff:test" });
    }
    expect(await orders.findByToken(order.trackingToken)).toMatchObject({ status: "DELIVERED", paymentStatus: "COD_COLLECTED" });
    const rows = await pool!.query<{ to_status: string }>("SELECT to_status FROM order_events WHERE order_id=$1 ORDER BY id", [order.id]);
    expect(rows.rows.map((e) => e.to_status)).toEqual(["PLACED", "ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED"]);
  });

  run("two simultaneous transitions: exactly one wins and one event is written", async () => {
    const { order } = await newOrder();
    const attempt = () =>
      transitionOrder(transitionDeps(), { orderId: order.id, to: "ACCEPTED", actor: "staff:test" }).then(
        () => "ok",
        (e: unknown) => (e instanceof AppError ? e.code : "ERR"),
      );
    const outcomes = await Promise.all([attempt(), attempt()]);
    expect(outcomes.filter((o) => o === "ok")).toHaveLength(1);
    expect(outcomes.filter((o) => o === "CONFLICT" || o === "ILLEGAL_TRANSITION")).toHaveLength(1);
    expect(await count("SELECT count(*) FROM order_events WHERE order_id=$1 AND to_status='ACCEPTED'", [order.id])).toBe(1);
  });

  run("applyTransition is compare-and-set on the event's from-status", async () => {
    const { order } = await newOrder();
    const event = { from: "PLACED", to: "ACCEPTED", actor: "staff:test" } as const;
    expect(await orders.applyTransition({ orderId: order.id, event })).toBe(true);
    expect(await orders.applyTransition({ orderId: order.id, event })).toBe(false);
    expect(await count("SELECT count(*) FROM order_events WHERE order_id=$1", [order.id])).toBe(2);
  });

  run("the database itself refuses illegal status jumps and unpaid online work", async () => {
    const { order: pickup } = await newOrder({ service: "pickup", branchId: 1, location: undefined, address: undefined });
    await rejects("UPDATE orders SET status = 'DELIVERED' WHERE id = $1", [pickup.id], /illegal order status transition/);
    await pool!.query("UPDATE orders SET status = 'ACCEPTED' WHERE id = $1", [pickup.id]); // legal moves still work

    const { order: online } = await newOrder({ paymentMethod: "online" });
    await rejects("UPDATE orders SET status = 'ACCEPTED' WHERE id = $1", [online.id], /not paid/);
    await pool!.query("UPDATE orders SET status = 'CANCELLED' WHERE id = $1", [online.id]); // cancelling is always allowed
  });

  run("kitchen board hides unpaid online orders, honours limit and branch", async () => {
    const { order: online } = await newOrder({ paymentMethod: "online" });
    const { order: cod } = await newOrder();
    const ids = (await orders.listByStatuses(["PLACED"], { limit: 500 })).map((o) => o.id);
    expect(ids).toContain(cod.id);
    expect(ids).not.toContain(online.id);
    expect(await orders.listByStatuses(["PLACED"], { limit: 1 })).toHaveLength(1);
    expect(await orders.listByStatuses(["PLACED"], { limit: 500, branchId: 999 })).toHaveLength(0);
  });
});

describe("schema constraints", () => {
  run("reject rows that would break order integrity", async () => {
    const { order } = await newOrder();
    const line = await one("SELECT id FROM order_lines WHERE order_id = $1", [order.id]);
    const topping = await idOf("toppings", "Olives");

    // a topping must belong to an existing half of the same line
    await rejects("INSERT INTO order_line_toppings (order_line_id, half, topping_id, action, price_delta_piastres) VALUES ($1,'left',$2,'add',100)", [line, topping], /order_line_toppings_half_fk/);
    // removals are free
    await rejects("INSERT INTO order_line_toppings (order_line_id, half, topping_id, action, price_delta_piastres) VALUES ($1,'whole',$2,'remove',100)", [line, topping], /remove_is_free/);
    // a half's size must belong to its item
    const other = await idOf("items", "Margherita");
    await rejects("INSERT INTO order_line_halves (order_line_id, half, item_id, size_id) VALUES ($1,'left',$2,(SELECT id FROM item_sizes WHERE item_id <> $2 LIMIT 1))", [line, other], /size_item_fk/);
    // total must equal subtotal + delivery fee
    await rejects("UPDATE orders SET total_piastres = total_piastres + 1 WHERE id = $1", [order.id], /total_piastres_check|check constraint/);
    // payment method and status must agree
    await rejects("UPDATE orders SET payment_status = 'PAID' WHERE id = $1", [order.id], /orders_payment_consistent/);
  });

  run("an order cannot use another customer's address", async () => {
    const { order } = await newOrder();
    const intruder = await new PgCustomerRepo(pool!).upsertByPhone(newPhone());
    const addressId = await one("SELECT address_id FROM orders WHERE id = $1", [order.id]);
    await rejects("UPDATE orders SET customer_id = $2 WHERE id = $1", [order.id, intruder.id], /orders_address_owner_fk/);
    expect(addressId).toBeTruthy();
  });

  run("audit tables are append-only, including TRUNCATE", async () => {
    await pool!.query("INSERT INTO audit_log (actor, action, outcome) VALUES ('t', 't', 'ok')");
    await rejects("UPDATE order_events SET actor = 'tamper'", [], /append-only/);
    await rejects("DELETE FROM audit_log", [], /append-only/);
    await rejects("TRUNCATE order_events", [], /append-only/);
    await rejects("TRUNCATE audit_log", [], /append-only/);
  });
});

describe("authentication storage", () => {
  const secrets = () => new NodeSecretService(OTP_SECRET);
  const authDeps = () => {
    const sender = new CapturingOtpSender();
    return {
      sender,
      deps: {
        secrets: secrets(),
        otps: new PgOtpRepo(pool!),
        sessions: new PgSessionRepo(pool!),
        customers: new PgCustomerRepo(pool!),
        staff: new PgStaffRepo(pool!),
        sender,
        now: () => new Date(),
      },
    };
  };

  run("customer login works end to end, stores only digests, and sessions can be revoked", async () => {
    const { deps: a, sender } = authDeps();
    const phone = newPhone();
    await requestOtp(a, phone);
    const code = sender.last(phone);
    expect(await count("SELECT count(*) FROM otp_requests WHERE code_digest = $1", [code])).toBe(0);

    const session = await verifyOtp(a, phone, code);
    expect(await count("SELECT count(*) FROM sessions WHERE token_hash = $1", [session.token])).toBe(0);
    expect(await authenticateCustomer(a, session.token)).toMatchObject({ phone });
    await expect(verifyOtp(a, phone, code)).rejects.toMatchObject({ code: "UNAUTHORIZED" }); // single use

    await logout(a, session.token);
    await expect(authenticateCustomer(a, session.token)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  run("a challenge allows at most five guesses, even under 20 parallel attempts", async () => {
    const { deps: a } = authDeps();
    const phone = newPhone();
    await a.otps.createIfUnderLimit({ phone, codeDigest: a.secrets.digestOtp(phone, "123456"), expiresAt: new Date(Date.now() + 60_000) }, new Date(0), 3);
    const active = (await a.otps.findActive(phone, new Date()))!;
    const claims = await Promise.all(Array.from({ length: 20 }, () => a.otps.claimAttempt(active.id, 5)));
    expect(claims.filter(Boolean)).toHaveLength(5);
  });

  run("concurrent verification of the right code yields a single session", async () => {
    const { deps: a, sender } = authDeps();
    const phone = newPhone();
    await requestOtp(a, phone);
    const code = sender.last(phone);
    const settled = await Promise.allSettled(Array.from({ length: 4 }, () => verifyOtp(a, phone, code)));
    expect(settled.filter((s) => s.status === "fulfilled")).toHaveLength(1);
  });

  run("staff accounts: hashed passwords, generic failures, deactivation, role and branch", async () => {
    const { deps: a } = authDeps();
    const hash = await a.secrets.hashPassword("a long staff password");
    await pool!.query("INSERT INTO staff_users (username, password_hash, role, branch_id) VALUES ('pg-amira', $1, 'kitchen', 1)", [hash]);

    const session = await staffLogin(a, "pg-amira", "a long staff password");
    expect(await authenticateStaff(a, session.token)).toMatchObject({ username: "pg-amira", role: "kitchen", branchId: 1 });
    await expect(staffLogin(a, "pg-amira", "wrong password!!!")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(staffLogin(a, "ghost", "a long staff password")).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    await pool!.query("UPDATE staff_users SET is_active = FALSE WHERE username = 'pg-amira'");
    await expect(authenticateStaff(a, session.token)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(staffLogin(a, "pg-amira", "a long staff password")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("online payments storage", () => {
  const paidEvent = (providerRef: string, amount: number, over: Partial<WebhookEvent> = {}): WebhookEvent => ({
    providerRef, transactionId: randomUUID(), success: true, pending: false, refunded: false, amountPiastres: amount, ...over,
  });

  async function onlineOrder() {
    const { order } = await newOrder({ paymentMethod: "online" });
    const ref = `pm-${randomUUID()}`;
    await payments.recordPending({ orderId: order.id, provider: "paymob", providerRef: ref, amountPiastres: order.totalPiastres });
    return { order, ref };
  }
  const status = (token: string) => orders.findByToken(token);

  run("a verified success marks the order PAID and unlocks the kitchen", async () => {
    const { order, ref } = await onlineOrder();
    expect(await payments.settle("paymob", paidEvent(ref, order.totalPiastres), {})).toMatchObject({ outcome: "paid", trackingToken: order.trackingToken });
    expect(await status(order.trackingToken)).toMatchObject({ paymentStatus: "PAID" });
    await transitionOrder(transitionDeps(), { orderId: order.id, to: "ACCEPTED", actor: "staff:test" });
  });

  run("replays and concurrent deliveries are harmless", async () => {
    const { order, ref } = await onlineOrder();
    const ev = paidEvent(ref, order.totalPiastres);
    const results = await Promise.all([payments.settle("paymob", ev, {}), payments.settle("paymob", ev, {}), payments.settle("paymob", ev, {})]);
    expect(results.filter((r) => r.outcome === "paid")).toHaveLength(1);
    expect(results.filter((r) => r.outcome === "duplicate")).toHaveLength(2);
    expect(await count("SELECT count(*) FROM payments WHERE provider_ref = $1", [ref])).toBe(1);
  });

  run("the wrong amount never confirms the order", async () => {
    const { order, ref } = await onlineOrder();
    expect(await payments.settle("paymob", paidEvent(ref, order.totalPiastres - 100), {})).toEqual({ outcome: "amount_mismatch" });
    expect(await status(order.trackingToken)).toMatchObject({ paymentStatus: "UNPAID" });
  });

  run("unknown references are ignored; pending events change nothing; a failure can be followed by a success", async () => {
    expect(await payments.settle("paymob", paidEvent("no-such-ref", 100), {})).toEqual({ outcome: "unknown" });

    const { order, ref } = await onlineOrder();
    expect(await payments.settle("paymob", paidEvent(ref, order.totalPiastres, { pending: true, success: false }), {})).toEqual({ outcome: "ignored" });
    expect(await payments.settle("paymob", paidEvent(ref, order.totalPiastres, { success: false }), {})).toMatchObject({ outcome: "failed" });
    expect(await status(order.trackingToken)).toMatchObject({ paymentStatus: "UNPAID" });
    expect(await payments.settle("paymob", paidEvent(ref, order.totalPiastres), {})).toMatchObject({ outcome: "paid" });
  });

  run("refunds flip PAID to REFUNDED only for paid payments", async () => {
    const { order, ref } = await onlineOrder();
    expect(await payments.settle("paymob", paidEvent(ref, order.totalPiastres, { refunded: true }), {})).toEqual({ outcome: "ignored" });
    await payments.settle("paymob", paidEvent(ref, order.totalPiastres), {});
    expect(await payments.settle("paymob", paidEvent(ref, order.totalPiastres, { refunded: true }), {})).toMatchObject({ outcome: "refunded" });
    expect(await status(order.trackingToken)).toMatchObject({ paymentStatus: "REFUNDED" });
  });
});

describe("admin storage", () => {
  run("creates and edits items, writing an audit entry for every change", async () => {
    const before = await count("SELECT count(*) FROM audit_log");
    const item = await admin.createItem("staff:test", {
      categoryId: await one("SELECT id FROM categories ORDER BY id LIMIT 1"), kind: "pizza", nameAr: "اختبار", nameEn: "Test pizza",
      sizes: [{ label: "S", pricePiastres: 9000 }, { label: "L", pricePiastres: 15000 }],
    });
    expect(item.sizes.map((s) => s.label)).toEqual(["S", "L"]);

    const updated = await admin.updateItem("staff:test", item.id, { isAvailable: false, nameEn: "Renamed" });
    expect(updated).toMatchObject({ ok: true, value: { isAvailable: false, nameEn: "Renamed" } });
    expect(await admin.updateItem("staff:test", 99_999, { isAvailable: false })).toEqual({ ok: false, reason: "not_found" });

    expect((await admin.setSizePrice("staff:test", item.sizes[0]!.id, 9500)).ok).toBe(true);
    expect(await one("SELECT price_piastres FROM item_sizes WHERE id = $1", [item.sizes[0]!.id])).toBe(9500);
    expect(await count("SELECT count(*) FROM audit_log")).toBe(before + 3);

    // unavailable items are rejected at checkout
    const line = { qty: 1, halves: [{ half: "whole" as const, itemId: item.id, sizeId: item.sizes[0]!.id, toppings: [] }] };
    await expect(placeOrder(deps, base({ lines: [line, await simpleLine()] }))).rejects.toMatchObject({ code: "INVALID_CART" });
  });

  run("manages toppings, crusts, zones and branch availability", async () => {
    const cheese = await idOf("toppings", "Extra cheese");
    expect((await admin.setToppingPrice("staff:test", cheese, 1600)).ok).toBe(true);
    expect((await admin.setToppingAvailability("staff:test", cheese, false)).ok).toBe(true);
    expect((await admin.listToppings()).find((t) => t.id === cheese)).toMatchObject({ priceDeltaPiastres: 1600, isAvailable: false });
    await admin.setToppingAvailability("staff:test", cheese, true);
    await admin.setToppingPrice("staff:test", cheese, 1500);

    expect((await admin.setCrustPrice("staff:test", await idOf("crusts", "Thin"), 100)).ok).toBe(true);
    await admin.setCrustPrice("staff:test", await idOf("crusts", "Thin"), 0);
    expect(await admin.setCrustPrice("staff:test", 99_999, 1)).toEqual({ ok: false, reason: "not_found" });

    const zone = await admin.createZone("staff:test", { branchId: 1, name: "extra", radiusM: 8000, feePiastres: 4000, minOrderPiastres: 15000, etaMinutes: null });
    expect((await admin.updateZone("staff:test", zone.id, { feePiastres: 4500 }))).toMatchObject({ ok: true, value: { feePiastres: 4500 } });
    expect((await admin.listZones()).some((z) => z.id === zone.id)).toBe(true);
    expect((await admin.deleteZone("staff:test", zone.id)).ok).toBe(true);
    expect((await admin.deleteZone("staff:test", zone.id)).ok).toBe(false);

    expect((await admin.setBranchOpen("staff:test", 1, false)).ok).toBe(true);
    await expect(placeOrder(deps, base({ lines: [await simpleLine()] }))).rejects.toMatchObject({ code: "OUT_OF_ZONE" });
    await admin.setBranchOpen("staff:test", 1, true);
  });

  run("the daily report separates COD expected, collected and outstanding", async () => {
    const day = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
    const a = await newOrder({ service: "pickup", branchId: 1, location: undefined, address: undefined });
    await newOrder({ service: "pickup", branchId: 1, location: undefined, address: undefined });
    for (const to of ["ACCEPTED", "PREPARING", "READY", "PICKED_UP"] as const) {
      await transitionOrder(transitionDeps(), { orderId: a.order.id, to, actor: "staff:test" });
    }
    const report = await admin.dailyReport(day);
    expect(report.date).toBe(day);
    expect(report.orders["PICKED_UP"]).toBeGreaterThanOrEqual(1);
    expect(report.cod.collectedPiastres).toBeGreaterThanOrEqual(a.order.totalPiastres);
    expect(report.cod.expectedPiastres - report.cod.collectedPiastres).toBe(report.cod.outstandingPiastres);
    expect(report.cod.outstandingPiastres).toBeGreaterThan(0);

    const listed = await admin.listOrders({ date: day, status: "PICKED_UP", limit: 5 });
    expect(listed.every((o) => o.status === "PICKED_UP")).toBe(true);
    expect((await admin.dailyReport("2001-01-01")).revenuePiastres).toBe(0);
  });
});

describe("abuse controls in the database", () => {
  const dayNow = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });

  run("OTP creation is capped per phone even under 12 parallel requests", async () => {
    const otps = new PgOtpRepo(pool!);
    const phone = newPhone();
    const since = new Date(Date.now() - 600_000);
    const results = await Promise.all(
      Array.from({ length: 12 }, () => otps.createIfUnderLimit({ phone, codeDigest: "d", expiresAt: new Date(Date.now() + 60_000) }, since, 3)),
    );
    expect(results.filter(Boolean)).toHaveLength(3);
    expect(await otps.createIfUnderLimit({ phone: newPhone(), codeDigest: "d", expiresAt: new Date(Date.now() + 60_000) }, since, 3)).toBe(true);
  });

  run("failed guesses are summed across codes and exclude consumed challenges", async () => {
    const otps = new PgOtpRepo(pool!);
    const phone = newPhone();
    const far = new Date(Date.now() + 60_000);
    await otps.createIfUnderLimit({ phone, codeDigest: "a", expiresAt: far }, new Date(0), 9);
    await otps.createIfUnderLimit({ phone, codeDigest: "b", expiresAt: far }, new Date(0), 9);
    const since = new Date(Date.now() - 86_400_000);
    const rows = await pool!.query<{ id: string }>("SELECT id FROM otp_requests WHERE phone = $1 ORDER BY id", [phone]);
    for (const r of rows.rows) for (let i = 0; i < 3; i++) await otps.claimAttempt(Number(r.id), 5);
    expect(await otps.failedAttemptsSince(phone, since)).toBe(6);
    await otps.consume(Number(rows.rows[0]!.id), new Date());
    expect(await otps.failedAttemptsSince(phone, since)).toBe(3);
    expect(await otps.failedAttemptsSince(phone, new Date(Date.now() + 1000))).toBe(0);
  });

  run("staff login failures are recorded and counted per username within a window", async () => {
    const staff = new PgStaffRepo(pool!);
    await staff.recordLoginFailure("pg-failer", new Date());
    await staff.recordLoginFailure("pg-failer", new Date(Date.now() - 3_600_000));
    await staff.recordLoginFailure("someone-else", new Date());
    expect(await staff.countLoginFailures("pg-failer", new Date(Date.now() - 900_000))).toBe(1);
    expect(await staff.countLoginFailures("pg-failer", new Date(Date.now() - 7_200_000))).toBe(2);
  });

  run("the hourly order cap holds when 14 requests with different keys arrive at once", async () => {
    const phone = newPhone();
    const line = await simpleLine();
    const settled = await Promise.allSettled(Array.from({ length: 14 }, () => placeOrder(deps, base({ phone, lines: [line] }))));
    expect(settled.filter((s) => s.status === "fulfilled")).toHaveLength(10);
    for (const s of settled.filter((x) => x.status === "rejected")) {
      expect(((s as PromiseRejectedResult).reason as AppError).code).toBe("RATE_LIMITED");
    }
    expect(await orders.countSince(phone, new Date(Date.now() - 3_600_000))).toBe(10);
  });

  run("only the owner can resolve an order by token for checkout", async () => {
    const phone = newPhone();
    const { order } = await newOrder({ phone });
    const owner = await new PgCustomerRepo(pool!).upsertByPhone(phone);
    const stranger = await new PgCustomerRepo(pool!).upsertByPhone(newPhone());
    expect(await orders.findByTokenForCustomer(order.trackingToken, owner.id)).toMatchObject({ id: order.id });
    expect(await orders.findByTokenForCustomer(order.trackingToken, stranger.id)).toBeNull();
    expect(await orders.findByTokenForCustomer("nope-nope-nope", owner.id)).toBeNull();
  });
});

describe("payments: money is never silently lost", () => {
  const ev = (providerRef: string, amount: number): WebhookEvent => ({
    providerRef, transactionId: randomUUID(), success: true, pending: false, refunded: false, amountPiastres: amount,
  });
  async function onlineOrder() {
    const { order } = await newOrder({ paymentMethod: "online" });
    const ref = `pm-${randomUUID()}`;
    await payments.recordPending({ orderId: order.id, provider: "paymob", providerRef: ref, amountPiastres: order.totalPiastres });
    return { order, ref };
  }
  const paymentStatus = (ref: string) => one<string>("SELECT status FROM payments WHERE provider_ref = $1", [ref]);
  const attention = (target: string) => count("SELECT count(*) FROM audit_log WHERE target = $1 AND outcome = 'attention'", [target]);

  run("a second successful payment for the same order is flagged for refund, not marked as another success", async () => {
    const { order, ref } = await onlineOrder();
    const second = `pm-${randomUUID()}`;
    await payments.recordPending({ orderId: order.id, provider: "paymob", providerRef: second, amountPiastres: order.totalPiastres });

    expect(await payments.settle("paymob", ev(ref, order.totalPiastres), {})).toMatchObject({ outcome: "paid" });
    expect(await payments.settle("paymob", ev(second, order.totalPiastres), {})).toEqual({ outcome: "needs_refund" });
    expect(await paymentStatus(second)).toBe("needs_refund");
    expect(await attention(`order:${order.id}`)).toBe(1);
    expect((await orders.findByToken(order.trackingToken))!.paymentStatus).toBe("PAID");
  });

  run("a payment that lands after the order was cancelled never marks it paid", async () => {
    const { order, ref } = await onlineOrder();
    await transitionOrder(transitionDeps(), { orderId: order.id, to: "CANCELLED", actor: "staff:test", reason: "customer left" });
    expect(await payments.settle("paymob", ev(ref, order.totalPiastres), {})).toEqual({ outcome: "needs_refund" });
    expect((await orders.findByToken(order.trackingToken))!).toMatchObject({ status: "CANCELLED", paymentStatus: "UNPAID" });
    expect(await attention(`order:${order.id}`)).toBe(1);
  });

  run("cancelling an order that was already paid flags the payment for refund and shows in the report", async () => {
    const { order, ref } = await onlineOrder();
    await payments.settle("paymob", ev(ref, order.totalPiastres), {});
    await transitionOrder(transitionDeps(), { orderId: order.id, to: "CANCELLED", actor: "staff:test", reason: "kitchen closed" });
    expect(await paymentStatus(ref)).toBe("needs_refund");
    expect(await attention(`order:${order.id}`)).toBe(1);

    const report = await admin.dailyReport(new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" }));
    expect(report.online.refundDuePiastres).toBeGreaterThanOrEqual(order.totalPiastres);
  });

  run("hasRecentPending sees open checkouts and ignores settled or old ones", async () => {
    const { order, ref } = await onlineOrder();
    const hour = new Date(Date.now() - 3_600_000);
    expect(await payments.hasRecentPending(order.id, hour)).toBe(true);
    expect(await payments.hasRecentPending(order.id, new Date(Date.now() + 60_000))).toBe(false);
    await payments.settle("paymob", ev(ref, order.totalPiastres), {});
    expect(await payments.hasRecentPending(order.id, hour)).toBe(false);
  });
});

describe("expiry of abandoned online orders", () => {
  run("cancels only old, unpaid, online orders, with an audit trail", async () => {
    const { order: stale } = await newOrder({ paymentMethod: "online" });
    const { order: fresh } = await newOrder({ paymentMethod: "online" });
    const { order: cod } = await newOrder();
    await pool!.query("UPDATE orders SET created_at = now() - interval '3 hours' WHERE id = ANY($1::int[])", [[stale.id, cod.id]]);

    const ids = await orders.listExpiredUnpaid(new Date(Date.now() - 3_600_000), 50);
    expect(ids).toContain(stale.id);
    expect(ids).not.toContain(fresh.id);
    expect(ids).not.toContain(cod.id);

    const { expireUnpaidOrders } = await import("../src/application/expire-orders");
    expect(await expireUnpaidOrders(transitionDeps(), new Date())).toBeGreaterThanOrEqual(1);
    expect((await orders.findByToken(stale.trackingToken))!.status).toBe("CANCELLED");
    expect((await orders.findByToken(fresh.trackingToken))!.status).toBe("PLACED");
    expect((await orders.findByToken(cod.trackingToken))!.status).toBe("PLACED");
    expect(await one<string>("SELECT actor FROM order_events WHERE order_id = $1 AND to_status = 'CANCELLED'", [stale.id])).toBe("system:expiry");
  });
});
