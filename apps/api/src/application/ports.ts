import type { Branch, DeliveryZone } from "../domain/delivery";
import type { OrderEvent, OrderStatus, Service } from "../domain/order-state-machine";
import type { Catalog } from "../domain/pricing";

export type PaymentMethod = "cod" | "online";
export type PaymentStatus = "UNPAID" | "PAID" | "COD_PENDING" | "COD_COLLECTED" | "REFUNDED";

export interface DeliveryNetwork {
  readonly branches: readonly Branch[];
  readonly zones: readonly DeliveryZone[];
}

export interface MenuItemView {
  readonly id: number;
  readonly kind: string;
  readonly nameAr: string;
  readonly nameEn: string | null;
  readonly descriptionAr: string | null;
  readonly descriptionEn: string | null;
  readonly imageUrl: string | null;
  readonly sizes: readonly { readonly id: number; readonly label: string; readonly pricePiastres: number }[];
}

export interface MenuView {
  readonly categories: readonly {
    readonly id: number;
    readonly nameAr: string;
    readonly nameEn: string | null;
    readonly items: readonly MenuItemView[];
  }[];
  readonly crusts: readonly { readonly id: number; readonly nameAr: string; readonly nameEn: string | null; readonly priceDeltaPiastres: number }[];
  readonly toppings: readonly { readonly id: number; readonly nameAr: string; readonly nameEn: string | null; readonly priceDeltaPiastres: number }[];
}

export interface CatalogRepository {
  loadCatalog(): Promise<Catalog>;
  loadDeliveryNetwork(): Promise<DeliveryNetwork>;
  loadMenu(): Promise<MenuView>;
}

export interface NewOrderHalf {
  readonly half: "whole" | "left" | "right";
  readonly itemId: number;
  readonly sizeId: number;
  readonly toppings: readonly { readonly id: number; readonly action: "add" | "remove"; readonly deltaPiastres: number }[];
}

export interface NewOrderLine {
  readonly crustId: number | null;
  readonly qty: number;
  readonly unitPricePiastres: number;
  readonly note: string | null;
  readonly halves: readonly NewOrderHalf[];
}

export interface NewOrderAddress {
  readonly lat: number;
  readonly lng: number;
  readonly landmark: string;
  readonly building: string | null;
  readonly floor: string | null;
  readonly apartment: string | null;
  readonly notes: string | null;
}

export interface NewOrder {
  readonly phone: string;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly trackingToken: string;
  readonly branchId: number;
  readonly service: Service;
  readonly address: NewOrderAddress | null;
  readonly paymentMethod: PaymentMethod;
  readonly subtotalPiastres: number;
  readonly deliveryFeePiastres: number;
  readonly totalPiastres: number;
  readonly note: string | null;
  readonly lines: readonly NewOrderLine[];
}

export interface PlacedOrder {
  readonly id: number;
  readonly trackingToken: string;
  readonly status: OrderStatus;
  readonly paymentStatus: PaymentStatus;
  readonly totalPiastres: number;
}

export type CreateOrderResult =
  | { readonly outcome: "created" | "replayed"; readonly order: PlacedOrder }
  /** The customer already placed the maximum number of orders in the window (checked under a per-customer lock). */
  | { readonly outcome: "rate_limited" }
  /** The idempotency key was already used with a different request body. */
  | { readonly outcome: "key_conflict" };

export interface OrderView extends PlacedOrder {
  readonly service: Service;
  readonly subtotalPiastres: number;
  readonly deliveryFeePiastres: number;
  readonly branchPhone: string | null;
  readonly createdAt: string;
}

export interface OrderHistoryEntry {
  readonly trackingToken: string;
  readonly status: OrderStatus;
  readonly paymentStatus: PaymentStatus;
  readonly service: Service;
  readonly totalPiastres: number;
  readonly createdAt: string;
  /** Same shape the cart endpoints accept, so a past order can be re-priced and re-ordered. */
  readonly lines: readonly {
    readonly qty: number;
    readonly crustId: number | null;
    readonly note: string | null;
    readonly halves: readonly {
      readonly half: "whole" | "left" | "right";
      readonly itemId: number;
      readonly sizeId: number;
      readonly toppings: readonly { readonly id: number; readonly action: "add" | "remove" }[];
    }[];
  }[];
}

export interface KitchenOrderView {
  readonly id: number;
  readonly status: OrderStatus;
  readonly service: Service;
  readonly paymentMethod: PaymentMethod;
  readonly paymentStatus: PaymentStatus;
  readonly totalPiastres: number;
  readonly note: string | null;
  readonly statusSince: string;
  readonly lines: readonly {
    readonly qty: number;
    readonly note: string | null;
    readonly crust: string | null;
    readonly halves: readonly {
      readonly half: "whole" | "left" | "right";
      readonly item: string;
      readonly size: string;
      readonly toppings: readonly { readonly name: string; readonly action: "add" | "remove" }[];
    }[];
  }[];
}

export interface OrderForTransition {
  readonly id: number;
  readonly branchId: number;
  readonly trackingToken: string;
  readonly status: OrderStatus;
  readonly service: Service;
  readonly paymentMethod: PaymentMethod;
  readonly paymentStatus: PaymentStatus;
}

export interface OrderStatusEvent {
  readonly trackingToken: string;
  readonly status: OrderStatus;
  readonly paymentStatus: PaymentStatus;
}

/** Fire-and-forget notification that an order changed (drives the live tracking stream). */
export interface OrderEventPublisher {
  publish(event: OrderStatusEvent): void;
}

export interface OrderEventSource {
  subscribe(trackingToken: string, listener: (event: OrderStatusEvent) => void): () => void;
}

export interface KitchenListOptions {
  readonly branchId?: number;
  readonly limit: number;
}

export interface OrderRepository {
  /** Atomic per (phone, idempotencyKey): concurrent identical requests produce exactly one order. */
  create(order: NewOrder, window: { readonly since: Date; readonly max: number }): Promise<CreateOrderResult>;
  findByIdempotencyKey(phone: string, key: string): Promise<{ order: PlacedOrder; requestHash: string } | null>;
  countSince(phone: string, since: Date): Promise<number>;
  findByToken(token: string): Promise<OrderView | null>;
  /** Same as `findByToken` but only when the order belongs to this customer. */
  findByTokenForCustomer(token: string, customerId: number): Promise<OrderView | null>;
  /** Online orders still unpaid and created before `before`: candidates for automatic cancellation. */
  listExpiredUnpaid(before: Date, limit: number): Promise<readonly number[]>;
  findForTransition(id: number): Promise<OrderForTransition | null>;
  /** Compare-and-set on `event.from`; returns false when the order is no longer in that status. */
  applyTransition(args: {
    readonly orderId: number;
    readonly event: OrderEvent;
    readonly paymentStatus?: PaymentStatus;
  }): Promise<boolean>;
  /** Kitchen board: online orders appear only once paid. */
  listByStatuses(statuses: readonly OrderStatus[], options: KitchenListOptions): Promise<readonly KitchenOrderView[]>;
  listForCustomer(customerId: number, limit: number): Promise<readonly OrderHistoryEntry[]>;
}