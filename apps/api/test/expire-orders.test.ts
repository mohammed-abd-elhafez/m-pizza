import { beforeEach, describe, expect, it } from "vitest";
import { UNPAID_ORDER_TTL_MS, expireUnpaidOrders } from "../src/application/expire-orders";
import { placeOrder } from "../src/application/place-order";
import { fingerprint } from "../src/infra/crypto";
import { Clock, FakeCatalogRepo, FakeOrderRepo, RecordingEvents, near } from "./support/fakes";

let clock: Clock;
let orders: FakeOrderRepo;
let events: RecordingEvents;
let seq = 0;

async function newOrder(paymentMethod: "cod" | "online"): Promise<number> {
  const { order } = await placeOrder(
    { catalog: new FakeCatalogRepo(), orders, newToken: () => `tok-${++seq}`, fingerprint, now: clock.now },
    {
      phone: "+201012345678",
      idempotencyKey: `key-${++seq}-abcdefghijklmnop`,
      service: "delivery",
      location: near,
      address: { landmark: "x y z" },
      paymentMethod,
      lines: [{ qty: 1, crustId: 1, halves: [{ half: "whole", itemId: 1, sizeId: 11, toppings: [] }] }],
    },
  );
  return order.id;
}

beforeEach(() => {
  clock = new Clock();
  orders = new FakeOrderRepo(clock);
  events = new RecordingEvents();
  seq = 0;
});

describe("expireUnpaidOrders", () => {
  it("cancels online orders left unpaid past the TTL, with a recorded system reason", async () => {
    const id = await newOrder("online");
    clock.advance(UNPAID_ORDER_TTL_MS + 1000);
    expect(await expireUnpaidOrders({ orders, events }, clock.now())).toBe(1);
    const stored = orders.stored.get(id)!;
    expect(stored.status).toBe("CANCELLED");
    expect(stored.events[0]).toMatchObject({ actor: "system:expiry", to: "CANCELLED" });
    expect(events.published.at(-1)).toMatchObject({ status: "CANCELLED" });
  });

  it("leaves recent unpaid orders, paid orders and cash orders alone", async () => {
    const recent = await newOrder("online");
    const cod = await newOrder("cod");
    const paid = await newOrder("online");
    orders.stored.get(paid)!.paymentStatus = "PAID";
    clock.advance(UNPAID_ORDER_TTL_MS - 60_000);
    expect(await expireUnpaidOrders({ orders, events }, clock.now())).toBe(0);
    clock.advance(2 * 60_000);
    await expireUnpaidOrders({ orders, events }, clock.now());
    expect(orders.stored.get(cod)!.status).toBe("PLACED");
    expect(orders.stored.get(paid)!.status).toBe("PLACED");
    expect(orders.stored.get(recent)!.status).toBe("CANCELLED");
  });

  it("is repeatable and tolerates an order that changed in the meantime", async () => {
    const id = await newOrder("online");
    clock.advance(UNPAID_ORDER_TTL_MS + 1000);
    const racing = Object.assign(Object.create(orders) as FakeOrderRepo, { applyTransition: async () => false });
    expect(await expireUnpaidOrders({ orders: racing, events }, clock.now())).toBe(0);
    expect(await expireUnpaidOrders({ orders, events }, clock.now())).toBe(1);
    expect(await expireUnpaidOrders({ orders, events }, clock.now())).toBe(0);
    expect(orders.stored.get(id)!.status).toBe("CANCELLED");
  });
});
