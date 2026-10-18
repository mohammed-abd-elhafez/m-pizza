import type { Pool, PoolClient } from "pg";
import type {
  CreateOrderResult,
  KitchenListOptions,
  KitchenOrderView,
  NewOrder,
  OrderForTransition,
  OrderHistoryEntry,
  OrderRepository,
  OrderView,
  PaymentMethod,
  PaymentStatus,
  PlacedOrder,
} from "../application/ports";
import type { OrderEvent, OrderStatus, Service } from "../domain/order-state-machine";

type Half = "whole" | "left" | "right";

interface PlacedRow {
  id: number;
  tracking_token: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  total_piastres: number;
}

const toPlaced = (r: PlacedRow): PlacedOrder => ({
  id: r.id,
  trackingToken: r.tracking_token,
  status: r.status,
  paymentStatus: r.payment_status,
  totalPiastres: r.total_piastres,
});

const PLACED_COLUMNS = "id, tracking_token, status, payment_status, total_piastres";

function groupBy<T, K>(rows: readonly T[], key: (row: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const row of rows) {
    const bucket = map.get(key(row));
    if (bucket) bucket.push(row);
    else map.set(key(row), [row]);
  }
  return map;
}

export class PgOrderRepo implements OrderRepository {
  constructor(private readonly pool: Pool) {}

  async create(order: NewOrder, window: { since: Date; max: number }): Promise<CreateOrderResult> {
    return this.inTransaction(async (db) => {
      const customer = await db.query<{ id: number }>(
        "INSERT INTO customers (phone) VALUES ($1) ON CONFLICT (phone) DO UPDATE SET phone = EXCLUDED.phone RETURNING id",
        [order.phone],
      );
      const customerId = customer.rows[0]!.id;

      // Serialise concurrent requests carrying the same idempotency key. Intentional: do not remove.
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`${customerId}:${order.idempotencyKey}`]);

      const existing = await this.findByKey(db, customerId, order.idempotencyKey);
      if (existing) {
        return existing.requestHash === order.requestHash
          ? { outcome: "replayed", order: existing.order }
          : { outcome: "key_conflict" };
      }

      // Per-customer lock so parallel requests with different keys cannot all slip under the hourly cap.
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 2))", [`customer:${customerId}`]);
      const recent = await db.query<{ n: string }>(
        "SELECT count(*) AS n FROM orders WHERE customer_id = $1 AND created_at >= $2",
        [customerId, window.since],
      );
      if (Number(recent.rows[0]?.n ?? 0) >= window.max) return { outcome: "rate_limited" };

      return { outcome: "created", order: await this.insertOrder(db, customerId, order) };
    });
  }

  async findByIdempotencyKey(phone: string, key: string): Promise<{ order: PlacedOrder; requestHash: string } | null> {
    const { rows } = await this.pool.query<PlacedRow & { request_hash: string }>(
      `SELECT o.id, o.tracking_token, o.status, o.payment_status, o.total_piastres, o.request_hash
         FROM orders o JOIN customers c ON c.id = o.customer_id
        WHERE c.phone = $1 AND o.idempotency_key = $2`,
      [phone, key],
    );
    const r = rows[0];
    return r ? { order: toPlaced(r), requestHash: r.request_hash } : null;
  }

  async countSince(phone: string, since: Date): Promise<number> {
    const { rows } = await this.pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM orders o JOIN customers c ON c.id = o.customer_id
        WHERE c.phone = $1 AND o.created_at >= $2`,
      [phone, since],
    );
    return Number(rows[0]?.n ?? 0);
  }

  async findByTokenForCustomer(token: string, customerId: number): Promise<OrderView | null> {
    const owned = await this.pool.query("SELECT 1 FROM orders WHERE tracking_token = $1 AND customer_id = $2", [token, customerId]);
    return owned.rowCount === 1 ? this.findByToken(token) : null;
  }

  async listExpiredUnpaid(before: Date, limit: number): Promise<readonly number[]> {
    const { rows } = await this.pool.query<{ id: number }>(
      `SELECT id FROM orders
        WHERE payment_method = 'online' AND payment_status = 'UNPAID' AND status = 'PLACED' AND created_at < $1
        ORDER BY created_at LIMIT $2`,
      [before, limit],
    );
    return rows.map((r) => r.id);
  }

  async findByToken(token: string): Promise<OrderView | null> {
    const { rows } = await this.pool.query<
      PlacedRow & {
        service: Service;
        subtotal_piastres: number;
        delivery_fee_piastres: number;
        branch_phone: string | null;
        created_at: Date;
      }
    >(
      `SELECT o.id, o.tracking_token, o.status, o.payment_status, o.total_piastres, o.service,
              o.subtotal_piastres, o.delivery_fee_piastres, b.phone AS branch_phone, o.created_at
         FROM orders o JOIN branches b ON b.id = o.branch_id
        WHERE o.tracking_token = $1`,
      [token],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      ...toPlaced(r),
      service: r.service,
      subtotalPiastres: r.subtotal_piastres,
      deliveryFeePiastres: r.delivery_fee_piastres,
      branchPhone: r.branch_phone,
      createdAt: r.created_at.toISOString(),
    };
  }

  async findForTransition(id: number): Promise<OrderForTransition | null> {
    const { rows } = await this.pool.query<{
      id: number;
      branch_id: number;
      tracking_token: string;
      status: OrderStatus;
      service: Service;
      payment_method: PaymentMethod;
      payment_status: PaymentStatus;
    }>("SELECT id, branch_id, tracking_token, status, service, payment_method, payment_status FROM orders WHERE id = $1", [id]);
    const r = rows[0];
    return r
      ? {
          id: r.id,
          branchId: r.branch_id,
          trackingToken: r.tracking_token,
          status: r.status,
          service: r.service,
          paymentMethod: r.payment_method,
          paymentStatus: r.payment_status,
        }
      : null;
  }

  async applyTransition(args: { orderId: number; event: OrderEvent; paymentStatus?: PaymentStatus }): Promise<boolean> {
    return this.inTransaction(async (db) => {
      const updated = await db.query(
        `UPDATE orders SET status = $2, payment_status = COALESCE($3, payment_status)
          WHERE id = $1 AND status = $4`,
        [args.orderId, args.event.to, args.paymentStatus ?? null, args.event.from],
      );
      if (updated.rowCount !== 1) return false;
      await db.query(
        "INSERT INTO order_events (order_id, from_status, to_status, actor, reason) VALUES ($1, $2, $3, $4, $5)",
        [args.orderId, args.event.from, args.event.to, args.event.actor, args.event.reason ?? null],
      );
      if (args.event.to === "CANCELLED") {
        // Cancelling an order whose online payment already succeeded leaves money to return: flag it, do not lose it.
        const flagged = await db.query(
          "UPDATE payments SET status = 'needs_refund', updated_at = now() WHERE order_id = $1 AND status = 'succeeded'",
          [args.orderId],
        );
        if ((flagged.rowCount ?? 0) > 0) {
          await db.query(
            "INSERT INTO audit_log (actor, action, target, outcome) VALUES ($1, 'order.cancelled_after_payment', $2, 'attention')",
            [args.event.actor, `order:${args.orderId}`],
          );
        }
      }
      return true;
    });
  }

  async listByStatuses(statuses: readonly OrderStatus[], options: KitchenListOptions): Promise<readonly KitchenOrderView[]> {
    const orders = await this.pool.query<{
      id: number;
      status: OrderStatus;
      service: Service;
      payment_method: PaymentMethod;
      payment_status: PaymentStatus;
      total_piastres: number;
      note: string | null;
      status_since: Date;
    }>(
      `SELECT o.id, o.status, o.service, o.payment_method, o.payment_status, o.total_piastres, o.note,
              COALESCE((SELECT max(e.created_at) FROM order_events e WHERE e.order_id = o.id), o.created_at) AS status_since
         FROM orders o
        WHERE o.status = ANY($1::text[])
          AND ($2::int IS NULL OR o.branch_id = $2)
          AND (o.payment_method = 'cod' OR o.payment_status = 'PAID' OR o.status = 'CANCELLED')
        ORDER BY o.created_at, o.id
        LIMIT $3`,
      [statuses, options.branchId ?? null, options.limit],
    );
    if (orders.rows.length === 0) return [];
    const ids = orders.rows.map((o) => o.id);

    const [lines, halves, toppings] = await Promise.all([
      this.pool.query<{ id: number; order_id: number; qty: number; note: string | null; crust: string | null }>(
        `SELECT l.id, l.order_id, l.qty, l.note, c.name_ar AS crust
           FROM order_lines l LEFT JOIN crusts c ON c.id = l.crust_id
          WHERE l.order_id = ANY($1::int[]) ORDER BY l.id`,
        [ids],
      ),
      this.pool.query<{ order_line_id: number; half: Half; item: string; size: string }>(
        `SELECT h.order_line_id, h.half, i.name_ar AS item, s.label AS size
           FROM order_line_halves h
           JOIN order_lines l ON l.id = h.order_line_id
           JOIN items i ON i.id = h.item_id
           JOIN item_sizes s ON s.id = h.size_id
          WHERE l.order_id = ANY($1::int[]) ORDER BY h.id`,
        [ids],
      ),
      this.pool.query<{ order_line_id: number; half: Half; name: string; action: "add" | "remove" }>(
        `SELECT t.order_line_id, t.half, tp.name_ar AS name, t.action
           FROM order_line_toppings t
           JOIN order_lines l ON l.id = t.order_line_id
           JOIN toppings tp ON tp.id = t.topping_id
          WHERE l.order_id = ANY($1::int[])
          ORDER BY t.order_line_id, t.half, tp.id`,
        [ids],
      ),
    ]);

    const linesByOrder = groupBy(lines.rows, (l) => l.order_id);
    const halvesByLine = groupBy(halves.rows, (h) => h.order_line_id);
    const toppingsByHalf = groupBy(toppings.rows, (t) => `${t.order_line_id}:${t.half}`);

    return orders.rows.map((o) => ({
      id: o.id,
      status: o.status,
      service: o.service,
      paymentMethod: o.payment_method,
      paymentStatus: o.payment_status,
      totalPiastres: o.total_piastres,
      note: o.note,
      statusSince: o.status_since.toISOString(),
      lines: (linesByOrder.get(o.id) ?? []).map((l) => ({
        qty: l.qty,
        note: l.note,
        crust: l.crust,
        halves: (halvesByLine.get(l.id) ?? []).map((h) => ({
          half: h.half,
          item: h.item,
          size: h.size,
          toppings: (toppingsByHalf.get(`${l.id}:${h.half}`) ?? []).map((t) => ({ name: t.name, action: t.action })),
        })),
      })),
    }));
  }

  async listForCustomer(customerId: number, limit: number): Promise<readonly OrderHistoryEntry[]> {
    const orders = await this.pool.query<
      PlacedRow & { service: Service; created_at: Date }
    >(
      `SELECT ${PLACED_COLUMNS}, service, created_at FROM orders
        WHERE customer_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2`,
      [customerId, limit],
    );
    if (orders.rows.length === 0) return [];
    const ids = orders.rows.map((o) => o.id);

    const [lines, halves, toppings] = await Promise.all([
      this.pool.query<{ id: number; order_id: number; qty: number; note: string | null; crust_id: number | null }>(
        "SELECT id, order_id, qty, note, crust_id FROM order_lines WHERE order_id = ANY($1::int[]) ORDER BY id",
        [ids],
      ),
      this.pool.query<{ order_line_id: number; half: Half; item_id: number; size_id: number }>(
        `SELECT h.order_line_id, h.half, h.item_id, h.size_id FROM order_line_halves h
           JOIN order_lines l ON l.id = h.order_line_id WHERE l.order_id = ANY($1::int[]) ORDER BY h.id`,
        [ids],
      ),
      this.pool.query<{ order_line_id: number; half: Half; topping_id: number; action: "add" | "remove" }>(
        `SELECT t.order_line_id, t.half, t.topping_id, t.action FROM order_line_toppings t
           JOIN order_lines l ON l.id = t.order_line_id WHERE l.order_id = ANY($1::int[])
          ORDER BY t.order_line_id, t.half, t.topping_id`,
        [ids],
      ),
    ]);

    const linesByOrder = groupBy(lines.rows, (l) => l.order_id);
    const halvesByLine = groupBy(halves.rows, (h) => h.order_line_id);
    const toppingsByHalf = groupBy(toppings.rows, (t) => `${t.order_line_id}:${t.half}`);

    return orders.rows.map((o) => ({
      trackingToken: o.tracking_token,
      status: o.status,
      paymentStatus: o.payment_status,
      service: o.service,
      totalPiastres: o.total_piastres,
      createdAt: o.created_at.toISOString(),
      lines: (linesByOrder.get(o.id) ?? []).map((l) => ({
        qty: l.qty,
        crustId: l.crust_id,
        note: l.note,
        halves: (halvesByLine.get(l.id) ?? []).map((h) => ({
          half: h.half,
          itemId: h.item_id,
          sizeId: h.size_id,
          toppings: (toppingsByHalf.get(`${l.id}:${h.half}`) ?? []).map((t) => ({ id: t.topping_id, action: t.action })),
        })),
      })),
    }));
  }

  private async insertOrder(db: PoolClient, customerId: number, o: NewOrder): Promise<PlacedOrder> {
    let addressId: number | null = null;
    if (o.address) {
      const a = o.address;
      const res = await db.query<{ id: number }>(
        `INSERT INTO addresses (customer_id, lat, lng, landmark_text, building, floor, apartment, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [customerId, a.lat, a.lng, a.landmark, a.building, a.floor, a.apartment, a.notes],
      );
      addressId = res.rows[0]!.id;
    }

    const inserted = await db.query<PlacedRow>(
      `INSERT INTO orders (customer_id, branch_id, service, address_id, payment_method, payment_status,
                           subtotal_piastres, delivery_fee_piastres, total_piastres, note,
                           idempotency_key, request_hash, tracking_token)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING ${PLACED_COLUMNS}`,
      [
        customerId, o.branchId, o.service, addressId, o.paymentMethod,
        o.paymentMethod === "cod" ? "COD_PENDING" : "UNPAID",
        o.subtotalPiastres, o.deliveryFeePiastres, o.totalPiastres, o.note,
        o.idempotencyKey, o.requestHash, o.trackingToken,
      ],
    );
    const placed = inserted.rows[0]!;

    for (const line of o.lines) {
      const l = await db.query<{ id: number }>(
        `INSERT INTO order_lines (order_id, crust_id, is_half_and_half, qty, unit_price_piastres, note)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [placed.id, line.crustId, line.halves.length === 2, line.qty, line.unitPricePiastres, line.note],
      );
      const lineId = l.rows[0]!.id;
      for (const h of line.halves) {
        await db.query(
          "INSERT INTO order_line_halves (order_line_id, half, item_id, size_id) VALUES ($1, $2, $3, $4)",
          [lineId, h.half, h.itemId, h.sizeId],
        );
        for (const t of h.toppings) {
          await db.query(
            `INSERT INTO order_line_toppings (order_line_id, half, topping_id, action, price_delta_piastres)
             VALUES ($1, $2, $3, $4, $5)`,
            [lineId, h.half, t.id, t.action, t.action === "add" ? t.deltaPiastres : 0],
          );
        }
      }
    }

    await db.query("INSERT INTO order_events (order_id, from_status, to_status, actor) VALUES ($1, NULL, 'PLACED', 'customer')", [
      placed.id,
    ]);
    return toPlaced(placed);
  }

  private async findByKey(
    db: PoolClient,
    customerId: number,
    key: string,
  ): Promise<{ order: PlacedOrder; requestHash: string } | null> {
    const { rows } = await db.query<PlacedRow & { request_hash: string }>(
      `SELECT ${PLACED_COLUMNS}, request_hash FROM orders WHERE customer_id = $1 AND idempotency_key = $2`,
      [customerId, key],
    );
    return rows[0] ? { order: toPlaced(rows[0]), requestHash: rows[0].request_hash } : null;
  }

  private async inTransaction<T>(work: (db: PoolClient) => Promise<T>): Promise<T> {
    const db = await this.pool.connect();
    try {
      await db.query("BEGIN");
      const result = await work(db);
      await db.query("COMMIT");
      return result;
    } catch (err) {
      await db.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      db.release();
    }
  }
}
