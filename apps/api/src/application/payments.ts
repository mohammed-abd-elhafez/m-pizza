import { AppError } from "./errors";
import type { Checkout, PaymentGateway, PaymentRepository } from "./payment-ports";
import type { OrderStatus } from "../domain/order-state-machine";
import type { OrderEventPublisher, PaymentStatus } from "./ports";

export interface PaymentDeps {
  readonly gateway: PaymentGateway;
  readonly repo: PaymentRepository;
  readonly events: OrderEventPublisher;
}

/** Opens a hosted checkout for an unpaid online order. Card data never touches this server. */
export async function startCheckout(
  deps: Pick<PaymentDeps, "gateway" | "repo">,
  order: { readonly id: number; readonly totalPiastres: number; readonly phone: string },
  attempt: string,
): Promise<Checkout> {
  const checkout = await deps.gateway.createCheckout({
    amountPiastres: order.totalPiastres,
    merchantOrderId: `m${order.id}-${attempt}`,
    customerPhone: order.phone,
  });
  await deps.repo.recordPending({
    orderId: order.id,
    provider: deps.gateway.provider,
    providerRef: checkout.providerRef,
    amountPiastres: order.totalPiastres,
  });
  return checkout;
}

/**
 * Processes a provider callback. The order is only ever confirmed here, after the signature verified and the
 * amount matched; the browser redirect after paying is never trusted.
 */
export async function handlePaymentWebhook(
  deps: PaymentDeps,
  req: { readonly rawBody: string; readonly query: Readonly<Record<string, string | undefined>> },
): Promise<{ readonly outcome: string }> {
  const event = deps.gateway.verifyWebhook(req);
  if (!event) throw new AppError("UNAUTHORIZED", "Invalid signature");

  // Keep only the normalised fields we act on; the raw callback can carry card data we have no reason to store.
  const result = await deps.repo.settle(deps.gateway.provider, event, event);
  if (result.outcome === "paid" || result.outcome === "refunded" || result.outcome === "failed") {
    const paymentStatus: PaymentStatus =
      result.outcome === "paid" ? "PAID" : result.outcome === "refunded" ? "REFUNDED" : "UNPAID";
    deps.events.publish({
      trackingToken: result.trackingToken,
      status: result.orderStatus as OrderStatus,
      paymentStatus,
    });
  }
  return { outcome: result.outcome };
}
