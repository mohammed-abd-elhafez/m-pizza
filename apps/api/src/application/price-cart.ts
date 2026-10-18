import { priceOrder, PricingError, type Catalog, type LineInput, type PricedOrder } from "../domain/pricing";
import { AppError } from "./errors";
import { resolveFulfilment, type Fulfilment, type FulfilmentRequest } from "./fulfilment";
import type { CatalogRepository } from "./ports";

export interface PriceCartInput extends FulfilmentRequest {
  readonly lines: readonly LineInput[];
}

export interface PricedCart {
  readonly fulfilment: Fulfilment;
  readonly priced: PricedOrder;
  readonly catalog: Catalog;
}

export function priceWithFulfilment(catalog: Catalog, fulfilment: Fulfilment, lines: readonly LineInput[]): PricedOrder {
  let priced: PricedOrder;
  try {
    priced = priceOrder(catalog, lines, fulfilment.deliveryFeePiastres);
  } catch (err) {
    if (err instanceof PricingError) throw new AppError("INVALID_CART", err.message);
    throw err;
  }
  if (priced.subtotal < fulfilment.minOrderPiastres) {
    throw new AppError("BELOW_MINIMUM", `Minimum order is ${fulfilment.minOrderPiastres} piastres`);
  }
  return priced;
}

/** Server-authoritative cart totals. Client-supplied prices are never read. */
export async function priceCart(repo: CatalogRepository, input: PriceCartInput): Promise<PricedCart> {
  const [catalog, network] = await Promise.all([repo.loadCatalog(), repo.loadDeliveryNetwork()]);
  const fulfilment = resolveFulfilment(network, input);
  return { fulfilment, priced: priceWithFulfilment(catalog, fulfilment, input.lines), catalog };
}
