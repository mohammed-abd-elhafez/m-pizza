import { assertValidPoint } from "../domain/delivery";
import type { Catalog, LineInput } from "../domain/pricing";
import { AppError } from "./errors";
import { priceCart, type PriceCartInput } from "./price-cart";
import type {
  CatalogRepository,
  NewOrder,
  NewOrderAddress,
  NewOrderLine,
  OrderRepository,
  PlacedOrder,
} from "./ports";

export const MAX_ORDERS_PER_HOUR = 10;
const HOUR_MS = 60 * 60 * 1000;

export interface AddressInput {
  readonly landmark: string;
  readonly building?: string;
  readonly floor?: string;
  readonly apartment?: string;
  readonly notes?: string;
}

export interface PlaceOrderInput extends PriceCartInput {
  readonly phone: string;
  readonly idempotencyKey: string;
  readonly address?: AddressInput;
  readonly paymentMethod: "cod" | "online";
  readonly note?: string;
}

export interface PlaceOrderDeps {
  readonly catalog: CatalogRepository;
  readonly orders: OrderRepository;
  readonly newToken: () => string;
  /** Stable digest of the request body, used to detect an idempotency key reused with a different request. */
  readonly fingerprint: (value: unknown) => string;
  readonly now: () => Date;
}

const keyReused = () => new AppError("CONFLICT", "Idempotency-Key was already used with a different request");

function toNewLine(catalog: Catalog, line: LineInput, unitPricePiastres: number | undefined): NewOrderLine {
  if (unitPricePiastres === undefined) throw new Error("Priced lines do not match the order lines");
  return {
    crustId: line.crustId ?? null,
    qty: line.qty,
    unitPricePiastres,
    note: line.note ?? null,
    halves: line.halves.map((h) => ({
      half: h.half,
      itemId: h.itemId,
      sizeId: h.sizeId,
      toppings: h.toppings.map((t) => {
        const topping = catalog.toppings[t.id];
        if (!topping) throw new Error(`Priced topping ${t.id} missing from catalog`);
        return { id: t.id, action: t.action, deltaPiastres: topping.delta };
      }),
    })),
  };
}

function toAddress(input: PlaceOrderInput): NewOrderAddress | null {
  if (input.service !== "delivery") return null;
  if (!input.location || !input.address) throw new AppError("INVALID_REQUEST", "Delivery requires a location and address");
  try {
    assertValidPoint(input.location);
  } catch (err) {
    if (err instanceof RangeError) throw new AppError("INVALID_REQUEST", "Invalid coordinates");
    throw err;
  }
  return {
    lat: input.location.lat,
    lng: input.location.lng,
    landmark: input.address.landmark,
    building: input.address.building ?? null,
    floor: input.address.floor ?? null,
    apartment: input.address.apartment ?? null,
    notes: input.address.notes ?? null,
  };
}

export async function placeOrder(
  deps: PlaceOrderDeps,
  input: PlaceOrderInput,
): Promise<{ readonly order: PlacedOrder; readonly replayed: boolean }> {
  const requestHash = deps.fingerprint({
    service: input.service,
    branchId: input.branchId ?? null,
    location: input.location ?? null,
    address: input.address ?? null,
    paymentMethod: input.paymentMethod,
    note: input.note ?? null,
    lines: input.lines,
  });

  // A retry must get the original answer even if the menu or zones changed since.
  const existing = await deps.orders.findByIdempotencyKey(input.phone, input.idempotencyKey);
  if (existing) {
    if (existing.requestHash !== requestHash) throw keyReused();
    return { order: existing.order, replayed: true };
  }

  const since = new Date(deps.now().getTime() - HOUR_MS);
  const rateLimited = () => new AppError("RATE_LIMITED", "Too many orders; please try again later");
  // Cheap early exit; the authoritative check runs again inside create() under a per-customer lock.
  if ((await deps.orders.countSince(input.phone, since)) >= MAX_ORDERS_PER_HOUR) throw rateLimited();

  const address = toAddress(input);
  const { fulfilment, priced, catalog } = await priceCart(deps.catalog, input);

  const newOrder: NewOrder = {
    phone: input.phone,
    idempotencyKey: input.idempotencyKey,
    requestHash,
    trackingToken: deps.newToken(),
    branchId: fulfilment.branchId,
    service: input.service,
    address,
    paymentMethod: input.paymentMethod,
    subtotalPiastres: priced.subtotal,
    deliveryFeePiastres: priced.deliveryFee,
    totalPiastres: priced.total,
    note: input.note ?? null,
    lines: input.lines.map((line, i) => toNewLine(catalog, line, priced.lines[i]?.unit)),
  };
  const result = await deps.orders.create(newOrder, { since, max: MAX_ORDERS_PER_HOUR });

  if (result.outcome === "key_conflict") throw keyReused();
  if (result.outcome === "rate_limited") throw rateLimited();
  return { order: result.order, replayed: result.outcome === "replayed" };
}
