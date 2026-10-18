import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requestOtp, verifyOtp } from "../src/application/customer-auth";
import { placeOrder, type PlaceOrderDeps } from "../src/application/place-order";
import { authenticateStaff } from "../src/application/sessions";
import { staffLogin } from "../src/application/staff-login";
import { transitionOrder } from "../src/application/transition-order";
import { applyAppRole } from "../src/infra/app-role";
import { NodeSecretService, fingerprint } from "../src/infra/crypto";
import { InMemoryOrderEvents } from "../src/infra/event-bus";
import { CapturingOtpSender } from "../src/infra/otp-senders";
import { PgAdminRepo } from "../src/infra/pg-admin";
import { PgCustomerRepo, PgOtpRepo, PgSessionRepo, PgStaffRepo } from "../src/infra/pg-auth";
import { PgCatalogRepo } from "../src/infra/pg-catalog";
import { PgOrderRepo } from "../src/infra/pg-orders";
import { PgPaymentRepo } from "../src/infra/pg-payments";
import { OTP_SECRET } from "./support/fakes";
import { APP_ROLE_SQL, createTestPool, urlFor } from "./support/test-db";

const DB = "mpizza_test_roles"; // its own database, so this file can run in parallel with the others
// Roles are cluster-wide: use a dedicated test role so the real `mpizza_app` (and its password) is never touched.
const APP_ROLE = "mpizza_app_test";
const PASSWORD = randomBytes(24).toString("base64url");

let owner: pg.Pool | null = null;
let app: pg.Pool;
let deps: PlaceOrderDeps;
let orders: PgOrderRepo;
let payments: PgPaymentRepo;
const events = new InMemoryOrderEvents();

beforeAll(async () => {
  owner = await createTestPool(DB);
  if (!owner) return;
  await applyAppRole(owner, PASSWORD, APP_ROLE_SQL, APP_ROLE);
  const url = urlFor(DB, APP_ROLE, PASSWORD)!;
  app = new pg.Pool({ connectionString: url, max: 6 });
  orders = new PgOrderRepo(app);
  payments = new PgPaymentRepo(app);
  deps = { catalog: new PgCatalogRepo(app), orders, newToken: randomUUID, fingerprint, now: () => new Date() };
}, 60_000);

afterAll(async () => {
  await app?.end();
  await owner?.end();
});

const run = (name: string, fn: () => Promise<void>) =>
  it(name, async (ctx) => {
    if (!owner) return ctx.skip();
    await fn();
  });

const denied = async (sql: string, params: unknown[] = []) => {
  await expect(app.query(sql, params)).rejects.toThrow(/permission denied|must be owner|read-only/i);
};

async function pepperoniLine() {
  const { rows } = await owner!.query<{ item: number; size: number; crust: number }>(
    `SELECT i.id AS item, s.id AS size, (SELECT id FROM crusts ORDER BY id LIMIT 1) AS crust
       FROM items i JOIN item_sizes s ON s.item_id = i.id WHERE i.name_en = 'Pepperoni' AND s.label = 'L'`,
  );
  const r = rows[0]!;
  return { qty: 1, crustId: r.crust, halves: [{ half: "whole" as const, itemId: r.item, sizeId: r.size, toppings: [] }] };
}

describe("the API runs end to end under the restricted database role", () => {
  run("the role is not a superuser and owns nothing", async () => {
    const { rows } = await owner!.query<{ rolsuper: boolean; rolcreaterole: boolean; rolcreatedb: boolean; rolreplication: boolean }>(
      "SELECT rolsuper, rolcreaterole, rolcreatedb, rolreplication FROM pg_roles WHERE rolname = $1",
      [APP_ROLE],
    );
    expect(rows[0]).toEqual({ rolsuper: false, rolcreaterole: false, rolcreatedb: false, rolreplication: false });
    const owned = await owner!.query("SELECT 1 FROM pg_class c JOIN pg_roles r ON r.oid = c.relowner WHERE r.rolname = $1", [APP_ROLE]);
    expect(owned.rowCount).toBe(0);
  });

  run("customer login, ordering, kitchen flow, online payment and reporting all work", async () => {
    const secrets = new NodeSecretService(OTP_SECRET);
    const sender = new CapturingOtpSender();
    const auth = {
      secrets, otps: new PgOtpRepo(app), sessions: new PgSessionRepo(app), customers: new PgCustomerRepo(app),
      staff: new PgStaffRepo(app), sender, now: () => new Date(),
    };

    // customer OTP login
    const phone = "+201012300001";
    await requestOtp(auth, phone);
    const session = await verifyOtp(auth, phone, sender.last(phone));
    expect(session.token).toBeTruthy();

    // order (cash), kitchen transitions, COD collected
    const line = await pepperoniLine();
    const { order } = await placeOrder(deps, {
      phone, idempotencyKey: randomUUID(), service: "delivery", location: { lat: 30.0534, lng: 31.2357 },
      address: { landmark: "next to the mosque" }, paymentMethod: "cod", lines: [line],
    });
    for (const to of ["ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED"] as const) {
      await transitionOrder({ orders, events }, { orderId: order.id, to, actor: "staff:test" });
    }
    expect((await orders.findByToken(order.trackingToken))!).toMatchObject({ status: "DELIVERED", paymentStatus: "COD_COLLECTED" });
    expect((await orders.listForCustomer(session.customerId, 5)).length).toBe(1);

    // online payment: pending -> paid, then a duplicate payment is flagged (writes audit_log)
    const online = await placeOrder(deps, {
      phone, idempotencyKey: randomUUID(), service: "pickup", branchId: 1, paymentMethod: "online", lines: [line],
    });
    const ref = `pm-${randomUUID()}`;
    await payments.recordPending({ orderId: online.order.id, provider: "paymob", providerRef: ref, amountPiastres: online.order.totalPiastres });
    const ev = { providerRef: ref, transactionId: "t", success: true, pending: false, refunded: false, amountPiastres: online.order.totalPiastres };
    expect(await payments.settle("paymob", ev, ev)).toMatchObject({ outcome: "paid" });
    const second = `pm-${randomUUID()}`;
    await payments.recordPending({ orderId: online.order.id, provider: "paymob", providerRef: second, amountPiastres: online.order.totalPiastres });
    expect(await payments.settle("paymob", { ...ev, providerRef: second }, ev)).toEqual({ outcome: "needs_refund" });
    await transitionOrder({ orders, events }, { orderId: online.order.id, to: "CANCELLED", actor: "staff:test", reason: "test" });

    // admin catalog operations and the report
    const admin = new PgAdminRepo(app);
    const item = await admin.createItem("staff:test", { categoryId: 1, kind: "pizza", nameAr: "اختبار", sizes: [{ label: "S", pricePiastres: 5000 }] });
    expect((await admin.updateItem("staff:test", item.id, { isAvailable: false })).ok).toBe(true);
    expect((await admin.setSizePrice("staff:test", item.sizes[0]!.id, 5500)).ok).toBe(true);
    const zone = await admin.createZone("staff:test", { branchId: 1, name: "t", radiusM: 1000, feePiastres: 1, minOrderPiastres: 0, etaMinutes: null });
    expect((await admin.updateZone("staff:test", zone.id, { feePiastres: 2 })).ok).toBe(true);
    expect((await admin.deleteZone("staff:test", zone.id)).ok).toBe(true);
    expect((await admin.setBranchOpen("staff:test", 1, true)).ok).toBe(true);
    expect((await admin.setToppingAvailability("staff:test", 1, true)).ok).toBe(true);
    const report = await admin.dailyReport(new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" }));
    expect(report.online.refundDuePiastres).toBeGreaterThan(0);
    expect((await admin.listOrders({ limit: 5 })).length).toBeGreaterThan(0);
  });

  run("staff login works with read-only access to staff accounts, and failures are recorded", async () => {
    const secrets = new NodeSecretService(OTP_SECRET);
    await owner!.query("INSERT INTO staff_users (username, password_hash, role) VALUES ('lp-admin', $1, 'admin')", [await secrets.hashPassword("a long staff password")]);
    const auth = {
      secrets, otps: new PgOtpRepo(app), sessions: new PgSessionRepo(app), customers: new PgCustomerRepo(app),
      staff: new PgStaffRepo(app), sender: new CapturingOtpSender(), now: () => new Date(),
    };
    const s = await staffLogin(auth, "lp-admin", "a long staff password");
    expect(await authenticateStaff(auth, s.token)).toMatchObject({ role: "admin" });
    await expect(staffLogin(auth, "lp-admin", "wrong password!!!")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect((await owner!.query("SELECT count(*) AS n FROM staff_login_failures WHERE username = 'lp-admin'")).rows[0]!.n).toBe("1");
  });
});

describe("a compromised API connection cannot do damage", () => {
  run("cannot change the schema or empty tables", async () => {
    await denied("DROP TABLE orders CASCADE");
    await denied("ALTER TABLE orders ADD COLUMN pwned TEXT");
    await denied("CREATE TABLE evil (id INT)");
    await denied("TRUNCATE orders CASCADE");
    await denied("TRUNCATE audit_log");
    await denied("DROP TRIGGER orders_status_guard ON orders");
    await denied("DROP FUNCTION guard_order_status CASCADE");
  });

  run("cannot rewrite or delete money, history or audit records", async () => {
    await denied("DELETE FROM orders");
    await denied("UPDATE orders SET total_piastres = 1, subtotal_piastres = 1, delivery_fee_piastres = 0");
    await denied("UPDATE orders SET customer_id = 1");
    await denied("UPDATE order_lines SET unit_price_piastres = 1");
    await denied("UPDATE order_events SET actor = 'tamper'");
    await denied("DELETE FROM order_events");
    await denied("DELETE FROM audit_log");
    await denied("UPDATE audit_log SET outcome = 'ok'");
    await denied("SELECT * FROM audit_log");
    await denied("DELETE FROM payments");
    await denied("UPDATE payments SET amount_piastres = 1");
    await denied("DELETE FROM sessions");
  });

  run("cannot grant itself access: no staff changes, no state-machine edits, no migration bookkeeping", async () => {
    await denied("INSERT INTO staff_users (username, password_hash, role) VALUES ('evil', 'x', 'admin')");
    await denied("UPDATE staff_users SET role = 'admin'");
    await denied("UPDATE staff_users SET is_active = TRUE");
    await denied("DELETE FROM staff_users");
    await denied("INSERT INTO allowed_transitions VALUES ('pickup', 'PLACED', 'DELIVERED')");
    await denied("UPDATE allowed_transitions SET to_status = 'DELIVERED'");
    await denied("SELECT * FROM schema_migrations");
    // PostgreSQL answers a non-owner's GRANT with a warning and grants nothing; assert the effect, not an error.
    await app.query("GRANT ALL ON orders TO PUBLIC");
    const leaked = await owner!.query("SELECT 1 FROM information_schema.role_table_grants WHERE grantee = 'PUBLIC' AND table_name = 'orders'");
    expect(leaked.rowCount).toBe(0);
    await denied("CREATE ROLE evil SUPERUSER");
    await denied(`ALTER ROLE ${APP_ROLE} SUPERUSER`);
  });

  run("cannot touch the catalog beyond what the admin screens do", async () => {
    await denied("DELETE FROM items");
    await denied("DELETE FROM item_sizes");
    await denied("UPDATE categories SET name_ar = 'x'");
    await denied("DELETE FROM branches");
    await denied("UPDATE branches SET lat = 0");
    await denied("UPDATE delivery_zones SET branch_id = 999");
  });

  run("the application's own legitimate writes still go through (sanity check of the grants)", async () => {
    const { rowCount } = await app.query("UPDATE toppings SET is_available = is_available WHERE id = 1");
    expect(rowCount).toBe(1);
  });
});
