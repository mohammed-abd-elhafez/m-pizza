export type Service = "delivery" | "pickup";

export type OrderStatus =
  | "PLACED"
  | "ACCEPTED"
  | "PREPARING"
  | "READY"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "PICKED_UP"
  | "CANCELLED";

export interface OrderEvent {
  readonly from: OrderStatus;
  readonly to: OrderStatus;
  readonly actor: string;
  readonly reason?: string;
}

const FINAL: readonly OrderStatus[] = ["DELIVERED", "PICKED_UP", "CANCELLED"];

const FORWARD: Readonly<Record<Service, Readonly<Partial<Record<OrderStatus, OrderStatus>>>>> = {
  delivery: {
    PLACED: "ACCEPTED",
    ACCEPTED: "PREPARING",
    PREPARING: "READY",
    READY: "OUT_FOR_DELIVERY",
    OUT_FOR_DELIVERY: "DELIVERED",
  },
  pickup: {
    PLACED: "ACCEPTED",
    ACCEPTED: "PREPARING",
    PREPARING: "READY",
    READY: "PICKED_UP",
  },
};

export function nextStatuses(from: OrderStatus, service: Service): OrderStatus[] {
  if (FINAL.includes(from)) return [];
  const forward = FORWARD[service][from];
  return forward ? [forward, "CANCELLED"] : ["CANCELLED"];
}

export function canTransition(from: OrderStatus, to: OrderStatus, service: Service): boolean {
  return nextStatuses(from, service).includes(to);
}

export function transition(
  from: OrderStatus,
  to: OrderStatus,
  service: Service,
  actor: string,
  reason?: string,
): OrderEvent {
  if (!canTransition(from, to, service)) {
    throw new Error(`Illegal transition ${from} -> ${to} for ${service}`);
  }
  if (to === "CANCELLED" && !reason?.trim()) {
    throw new Error("Cancellation requires a reason");
  }
  return Object.freeze({ from, to, actor, ...(reason ? { reason } : {}) });
}
