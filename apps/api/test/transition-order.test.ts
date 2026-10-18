import { beforeEach, describe, expect, it } from "vitest";
import { AppError } from "../src/application/errors";
import { placeOrder } from "../src/application/place-order";
import { transitionOrder } from "../src/application/transition-order";
import type { OrderStatus, Service } from "../src/domain/order-state-machine";
import { fingerprint } from "../src/infra/crypto";
import { Clock, FakeCatalogRepo, FakeOrderRepo, RecordingEvents, near } from "./support/fakes";

let clock: Clock;
let orders: FakeOrderRepo;
let events: RecordingEvents;
let seq = 0;

async function newOrder(service: Service, paymentMethod: "cod" | "online" = "cod"): Promise<number> {
  const { order } = await placeOrder(
    { catalog: new FakeCatalogRepo(), orders, newToken: () => `tok-${++seq}`, fingerprint, now: clock.now },
    {
      phone: "+201012345678",
      idempotencyKey: `k-${++seq}-abcdefghijklmnop`,
      service,
      ...(service === "delivery" ? { location: near, address: { landmark: "x y z" } } : { branchId: 1 }),
      paymentMethod,
      lines: [{ qty: 1, crustId: 1, halves: [{ half: "whole", itemId: 1, sizeId: 11, toppings: [] }] }],
    },
  );
  return order.id;
}

const move = (orderId: number, to: OrderStatus, extra: { reason?: string; branchScope?: number | null } = {}) =>
  transitionOrder({ orders, events }, { orderId, to, actor: "staff:test", ...extra });

async function walk(id: number, path: OrderStatus[]): Promise<void> {
  for (const to of path) await move(id, to);
}

const code = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
  } catch (e) {
    if (e instanceof AppError) return e.code;
    throw e;
  }
  return "NO_ERROR";
};

beforeEach(() => {
  clock = new Clock();
  orders = new FakeOrderRepo(clock);
  events = new RecordingEvents();
  seq = 0;
});

describe("transitionOrder", () => {
  it("walks a delivery order to DELIVERED, recording events and collecting COD", async () => {
    const id = await newOrder("delivery");
    await walk(id, ["ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED"]);
    const s = orders.stored.get(id)!;
    expect(s.status).toBe("DELIVERED");
    expect(s.paymentStatus).toBe("COD_COLLECTED");
    expect(s.events.map((e) => e.to)).toEqual(["ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED"]);
  });

  it("pickup finishes at PICKED_UP", async () => {
    const id = await newOrder("pickup");
    await walk(id, ["ACCEPTED", "PREPARING", "READY", "PICKED_UP"]);
    expect(orders.stored.get(id)!.paymentStatus).toBe("COD_COLLECTED");
  });

  it("publishes each change for live tracking, with the resulting payment status", async () => {
    const id = await newOrder("pickup");
    await walk(id, ["ACCEPTED", "PREPARING", "READY", "PICKED_UP"]);
    expect(events.published.map((e) => e.status)).toEqual(["ACCEPTED", "PREPARING", "READY", "PICKED_UP"]);
    expect(events.published.at(-1)).toMatchObject({ paymentStatus: "COD_COLLECTED" });
  });

  it("rejects illegal transitions and unknown orders, publishing nothing", async () => {
    const id = await newOrder("delivery");
    expect(await code(move(id, "DELIVERED"))).toBe("ILLEGAL_TRANSITION");
    expect(await code(move(999, "ACCEPTED"))).toBe("NOT_FOUND");
    expect(events.published).toHaveLength(0);
  });

  it("requires a reason to cancel and does not collect COD", async () => {
    const id = await newOrder("delivery");
    expect(await code(move(id, "CANCELLED"))).toBe("INVALID_REQUEST");
    await move(id, "CANCELLED", { reason: "customer called" });
    const s = orders.stored.get(id)!;
    expect(s.status).toBe("CANCELLED");
    expect(s.paymentStatus).toBe("COD_PENDING");
  });

  it("does not overwrite a payment status that is not COD_PENDING", async () => {
    const id = await newOrder("pickup");
    await walk(id, ["ACCEPTED", "PREPARING", "READY"]);
    orders.stored.get(id)!.paymentStatus = "REFUNDED";
    await move(id, "PICKED_UP");
    expect(orders.stored.get(id)!.paymentStatus).toBe("REFUNDED");
  });

  it("holds unpaid online orders until payment is confirmed, but allows cancelling them", async () => {
    const id = await newOrder("pickup", "online");
    expect(await code(move(id, "ACCEPTED"))).toBe("PAYMENT_PENDING");
    orders.stored.get(id)!.paymentStatus = "PAID";
    await move(id, "ACCEPTED");
    expect(orders.stored.get(id)!.status).toBe("ACCEPTED");

    const other = await newOrder("pickup", "online");
    await move(other, "CANCELLED", { reason: "abandoned" });
    expect(orders.stored.get(other)!.status).toBe("CANCELLED");
  });

  it("branch-scoped staff cannot see or move other branches' orders", async () => {
    const id = await newOrder("delivery");
    expect(await code(move(id, "ACCEPTED", { branchScope: 2 }))).toBe("NOT_FOUND");
    await move(id, "ACCEPTED", { branchScope: 1 });
    expect(orders.stored.get(id)!.status).toBe("ACCEPTED");
  });

  it("reports a conflict when the status changed concurrently", async () => {
    const id = await newOrder("delivery");
    const racing = Object.assign(Object.create(orders) as FakeOrderRepo, { applyTransition: async () => false });
    expect(await code(transitionOrder({ orders: racing, events }, { orderId: id, to: "ACCEPTED", actor: "k" }))).toBe("CONFLICT");
    expect(events.published).toHaveLength(0);
  });
});
