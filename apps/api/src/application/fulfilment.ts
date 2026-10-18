import { quoteDelivery, type Point } from "../domain/delivery";
import type { Service } from "../domain/order-state-machine";
import { AppError } from "./errors";
import type { DeliveryNetwork } from "./ports";

export interface FulfilmentRequest {
  readonly service: Service;
  readonly branchId?: number;
  readonly location?: Point;
}

export interface Fulfilment {
  readonly branchId: number;
  readonly deliveryFeePiastres: number;
  readonly minOrderPiastres: number;
  readonly etaMinutes: number | null;
}

/** Decides which branch serves the order and what delivery terms apply. Shared by pricing and checkout. */
export function resolveFulfilment(network: DeliveryNetwork, req: FulfilmentRequest): Fulfilment {
  if (req.service === "delivery") {
    if (!req.location) throw new AppError("INVALID_REQUEST", "Delivery requires a location");
    let quote: ReturnType<typeof quoteDelivery>;
    try {
      quote = quoteDelivery(network.branches, network.zones, req.location);
    } catch (err) {
      if (err instanceof RangeError) throw new AppError("INVALID_REQUEST", "Invalid coordinates");
      throw err;
    }
    if (!quote) throw new AppError("OUT_OF_ZONE", "Address is outside the delivery area");
    return {
      branchId: quote.branchId,
      deliveryFeePiastres: quote.feePiastres,
      minOrderPiastres: quote.minOrderPiastres,
      etaMinutes: quote.etaMinutes,
    };
  }

  const branch = network.branches.find((b) => b.id === req.branchId);
  if (!branch || !branch.isOpen) throw new AppError("BRANCH_UNAVAILABLE", "Branch is not available");
  return { branchId: branch.id, deliveryFeePiastres: 0, minOrderPiastres: 0, etaMinutes: null };
}
