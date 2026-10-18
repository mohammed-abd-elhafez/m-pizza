import { canTransition, transition, type OrderEvent, type OrderStatus } from "../domain/order-state-machine";
import { AppError } from "./errors";
import type { OrderEventPublisher, OrderRepository, PaymentStatus } from "./ports";

export interface TransitionInput {
  readonly orderId: number;
  readonly to: OrderStatus;
  readonly actor: string;
  readonly reason?: string;
  /** When set, the actor may only touch orders of this branch. */
  readonly branchScope?: number | null;
}

export interface TransitionDeps {
  readonly orders: OrderRepository;
  readonly events: OrderEventPublisher;
}

const COMPLETED: readonly OrderStatus[] = ["DELIVERED", "PICKED_UP"];

export async function transitionOrder(deps: TransitionDeps, input: TransitionInput): Promise<OrderEvent> {
  const order = await deps.orders.findForTransition(input.orderId);
  // Orders of other branches are indistinguishable from missing ones for scoped staff.
  if (!order || (input.branchScope != null && order.branchId !== input.branchScope)) {
    throw new AppError("NOT_FOUND", "Order not found");
  }

  if (!canTransition(order.status, input.to, order.service)) {
    throw new AppError("ILLEGAL_TRANSITION", `Cannot move order from ${order.status} to ${input.to}`);
  }
  if (input.to === "CANCELLED" && !input.reason?.trim()) {
    throw new AppError("INVALID_REQUEST", "Cancellation requires a reason");
  }
  if (order.paymentMethod === "online" && order.paymentStatus !== "PAID" && input.to !== "CANCELLED") {
    throw new AppError("PAYMENT_PENDING", "Online payment has not been confirmed yet");
  }

  const event = transition(order.status, input.to, order.service, input.actor, input.reason);
  const collected = COMPLETED.includes(input.to) && order.paymentMethod === "cod" && order.paymentStatus === "COD_PENDING";
  const paymentStatus: PaymentStatus | undefined = collected ? "COD_COLLECTED" : undefined;

  const applied = await deps.orders.applyTransition({ orderId: order.id, event, ...(paymentStatus ? { paymentStatus } : {}) });
  if (!applied) throw new AppError("CONFLICT", "Order status changed concurrently; reload and retry");

  deps.events.publish({
    trackingToken: order.trackingToken,
    status: input.to,
    paymentStatus: paymentStatus ?? order.paymentStatus,
  });
  return event;
}
