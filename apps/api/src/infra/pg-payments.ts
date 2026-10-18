import type { Pool } from "pg";
import type { PaymentRepository, SettleOutcome, WebhookEvent } from "../application/payment-ports";

export class PgPaymentRepo implements PaymentRepository {
  constructor(private readonly pool: Pool) {}

  async recordPending(p: { orderId: number; provider: string; providerRef: string; amountPiastres: number }): Promise<void> {
    await this.pool.query(
      `INSERT INTO payments (order_id, provider, provider_ref, amount_piastres, status)
       VALUES ($1, $2, $3, $4, 'pending')
       ON CONFLICT (provider, provider_ref) DO NOTHING`,
      [p.orderId, p.provider, p.providerRef, p.amountPiastres],
    );
  }

  async hasRecentPending(orderId: number, since: Date): Promise<boolean> {
    const { rows } = await this.pool.query<{ n: string }>(
      "SELECT count(*) AS n FROM payments WHERE order_id = $1 AND status = 'pending' AND created_at >= $2",
      [orderId, since],
    );
    return Number(rows[0]?.n ?? 0) > 0;
  }

  async settle(provider: string, event: WebhookEvent, rawPayload: unknown): Promise<SettleOutcome> {
    const db = await this.pool.connect();
    try {
      await db.query("BEGIN");
      const found = await db.query<{
        id: number;
        order_id: number;
        status: string;
        amount_piastres: number;
        order_status: string;
        payment_status: string;
        tracking_token: string;
      }>(
        `SELECT p.id, p.order_id, p.status, p.amount_piastres, o.status AS order_status,
                o.payment_status, o.tracking_token
           FROM payments p JOIN orders o ON o.id = p.order_id
          WHERE p.provider = $1 AND p.provider_ref = $2
          FOR UPDATE OF p, o`,
        [provider, event.providerRef],
      );
      const row = found.rows[0];
      if (!row) {
        await db.query("COMMIT");
        return { outcome: "unknown" };
      }

      const record = async (status: string): Promise<void> => {
        await db.query("UPDATE payments SET status = $2, raw_payload = $3, updated_at = now() WHERE id = $1", [
          row.id,
          status,
          JSON.stringify(rawPayload),
        ]);
      };
      const done = (outcome: "paid" | "failed" | "refunded"): SettleOutcome => ({
        outcome,
        trackingToken: row.tracking_token,
        orderStatus: row.order_status,
      });

      let result: SettleOutcome;
      if (event.refunded) {
        if (row.status === "succeeded") {
          await record("refunded");
          await db.query("UPDATE orders SET payment_status = 'REFUNDED' WHERE id = $1 AND payment_status = 'PAID'", [row.order_id]);
          result = done("refunded");
        } else {
          result = { outcome: "ignored" };
        }
      } else if (event.pending) {
        result = { outcome: "ignored" };
      } else if (event.success) {
        if (row.status === "succeeded" || row.status === "refunded") {
          result = { outcome: "duplicate" };
        } else if (event.amountPiastres !== row.amount_piastres) {
          await record("mismatch");
          result = { outcome: "amount_mismatch" };
        } else if (row.payment_status !== "UNPAID" || row.order_status === "CANCELLED") {
          // A second successful payment, or a payment that landed after the order was cancelled: never lose track of it.
          await record("needs_refund");
          await db.query(
            "INSERT INTO audit_log (actor, action, target, outcome) VALUES ('system:payments', 'payment.needs_refund', $1, 'attention')",
            [`order:${row.order_id}`],
          );
          result = { outcome: "needs_refund" };
        } else {
          await record("succeeded");
          await db.query("UPDATE orders SET payment_status = 'PAID' WHERE id = $1 AND payment_status = 'UNPAID'", [row.order_id]);
          result = done("paid");
        }
      } else if (row.status === "pending") {
        await record("failed");
        result = done("failed");
      } else {
        result = { outcome: "duplicate" };
      }
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
