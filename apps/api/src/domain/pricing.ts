/** All money is integer piastres. Catalog is read from the DB by the server, never from the client. */

export const MAX_LINE_QTY = 50;
export const MAX_ORDER_UNITS = 60;
export const MAX_ORDER_TOTAL_PIASTRES = 500_000; // 5,000 EGP; larger orders need staff handling

/** Raised for any invalid cart input; messages are safe to show to clients. */
export class PricingError extends Error {}

export interface CatalogItem {
  readonly id: number;
  readonly kind: "pizza" | "side" | "drink" | "dessert";
  readonly available: boolean;
}

export interface CatalogSize {
  readonly itemId: number;
  readonly label: string;
  readonly price: number;
}

export interface Catalog {
  readonly items: Readonly<Record<number, CatalogItem>>;
  readonly sizes: Readonly<Record<number, CatalogSize>>;
  readonly crusts: Readonly<Record<number, number>>;
  readonly toppings: Readonly<Record<number, { readonly delta: number; readonly available: boolean }>>;
}

export interface ToppingChange {
  readonly id: number;
  readonly action: "add" | "remove";
}

export interface HalfInput {
  readonly half: "whole" | "left" | "right";
  readonly itemId: number;
  readonly sizeId: number;
  readonly toppings: readonly ToppingChange[];
}

export interface LineInput {
  readonly halves: readonly HalfInput[];
  readonly crustId?: number;
  readonly qty: number;
  readonly note?: string;
}

export interface PricedLine {
  readonly unit: number;
  readonly total: number;
}

export interface PricedOrder {
  readonly lines: readonly PricedLine[];
  readonly subtotal: number;
  readonly deliveryFee: number;
  readonly total: number;
}

interface ResolvedHalf {
  readonly kind: CatalogItem["kind"];
  readonly sizeLabel: string;
  readonly base: number;
  readonly extras: number;
}

function assertShape(halves: readonly HalfInput[]): void {
  const isPair =
    halves.length === 2 && halves.some((h) => h.half === "left") && halves.some((h) => h.half === "right");
  const isWhole = halves.length === 1 && halves[0]?.half === "whole";
  if (!isPair && !isWhole) throw new PricingError("Invalid halves: expected one whole or a left+right pair");
}

function toppingExtras(catalog: Catalog, changes: readonly ToppingChange[]): number {
  const seen = new Set<number>();
  let extras = 0;
  for (const t of changes) {
    if (seen.has(t.id)) throw new PricingError(`Duplicate topping entry ${t.id}`);
    seen.add(t.id);
    const topping = catalog.toppings[t.id];
    if (!topping) throw new PricingError(`Unknown topping ${t.id}`);
    if (t.action === "add") {
      if (!topping.available) throw new PricingError(`Topping ${t.id} is unavailable`);
      extras += topping.delta;
    }
  }
  return extras;
}

function resolveHalf(catalog: Catalog, h: HalfInput): ResolvedHalf {
  const item = catalog.items[h.itemId];
  if (!item) throw new PricingError(`Unknown item ${h.itemId}`);
  if (!item.available) throw new PricingError(`Item ${h.itemId} is unavailable`);
  const size = catalog.sizes[h.sizeId];
  if (!size) throw new PricingError(`Unknown size ${h.sizeId}`);
  if (size.itemId !== h.itemId) throw new PricingError(`Size ${h.sizeId} does not belong to item ${h.itemId}`);
  if (item.kind !== "pizza" && h.toppings.length > 0) throw new PricingError("Toppings apply to pizza only");

  return { kind: item.kind, sizeLabel: size.label, base: size.price, extras: toppingExtras(catalog, h.toppings) };
}

function crustPrice(catalog: Catalog, crustId: number | undefined, resolved: readonly ResolvedHalf[]): number {
  if (crustId === undefined) return 0;
  if (resolved.some((r) => r.kind !== "pizza")) throw new PricingError("Crust applies to pizza only");
  const delta = catalog.crusts[crustId];
  if (delta === undefined) throw new PricingError(`Unknown crust ${crustId}`);
  return delta;
}

export function priceLine(catalog: Catalog, line: LineInput): PricedLine {
  if (!Number.isInteger(line.qty) || line.qty < 1 || line.qty > MAX_LINE_QTY) {
    throw new PricingError(`Invalid qty (1..${MAX_LINE_QTY})`);
  }
  assertShape(line.halves);

  const resolved = line.halves.map((h) => resolveHalf(catalog, h));

  if (resolved.length === 2) {
    if (resolved.some((r) => r.kind !== "pizza")) throw new PricingError("Half-and-half applies to pizza only");
    if (resolved[0]?.sizeLabel !== resolved[1]?.sizeLabel) throw new PricingError("Half sizes must match");
  }

  const base = Math.max(...resolved.map((r) => r.base));
  const extras = resolved.reduce((sum, r) => sum + r.extras, 0);
  const unit = base + crustPrice(catalog, line.crustId, resolved) + extras;
  return { unit, total: unit * line.qty };
}

export interface OrderCaps {
  readonly maxUnits?: number;
  readonly maxTotalPiastres?: number;
}

export function priceOrder(
  catalog: Catalog,
  lines: readonly LineInput[],
  deliveryFee: number,
  caps: OrderCaps = {},
): PricedOrder {
  if (!Number.isInteger(deliveryFee) || deliveryFee < 0) throw new PricingError("Invalid delivery fee");
  if (lines.length === 0) throw new PricingError("Order has no lines");

  const units = lines.reduce((sum, l) => sum + (Number.isInteger(l.qty) ? l.qty : 0), 0);
  if (units > (caps.maxUnits ?? MAX_ORDER_UNITS)) throw new PricingError("Too many items in one order");

  const priced = lines.map((l) => priceLine(catalog, l));
  const subtotal = priced.reduce((sum, l) => sum + l.total, 0);
  const total = subtotal + deliveryFee;
  if (total > (caps.maxTotalPiastres ?? MAX_ORDER_TOTAL_PIASTRES)) {
    throw new PricingError("Order is too large; please call the restaurant");
  }
  return { lines: priced, subtotal, deliveryFee, total };
}