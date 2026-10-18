import { AppError } from "./errors";
import type { TransitionDeps } from "./transition-order";
import { transitionOrder } from "./transition-order";

/** How long an online order may wait for payment (matches the provider's payment-key lifetime). */
export const UNPAID_ORDER_TTL_MS = 60 * 60 * 1000;
const BATCH = 100;

/**
 * Cancels online orders that were never paid, so a late webhook can never resurrect a stale order on the
 * kitchen board. Returns how many orders were cancelled. Safe to run on every instance and repeatedly.
 */
export async function expireUnpaidOrders(deps: TransitionDeps, now: Date): Promise<number> {
  const ids = await deps.orders.listExpiredUnpaid(new Date(now.getTime() - UNPAID_ORDER_TTL_MS), BATCH);
  let cancelled = 0;
  for (const orderId of ids) {
    try {
      await transitionOrder(deps, { orderId, to: "CANCELLED", actor: "system:expiry", reason: "Online payment was not completed in time" });
      cancelled += 1;
    } catch (err) {
      // Someone else moved or paid it between listing and cancelling; that is fine.
      if (!(err instanceof AppError)) throw err;
    }
  }
  return cancelled;
}
