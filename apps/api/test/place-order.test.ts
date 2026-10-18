import { beforeEach, describe, expect, it } from "vitest";
import { AppError } from "../src/application/errors";
import { MAX_ORDERS_PER_HOUR, placeOrder, type PlaceOrderDeps, type PlaceOrderInput } from "../src/application/place-order";
import { priceCart } from "../src/application/price-cart";
import type { LineInput } from "../src/domain/pricing";
import { fingerprint } from "../src/infra/crypto";
import { Clock, FakeCatalogRepo, FakeOrderRepo, far, near } from "./support/fakes";

const pizza: LineInput = {
  crustId: 2,
  qty: 1,
  halves: [{ half: "whole", itemId: 1, sizeId: 10, toppings: [{ id: 1, action: "add" }] }],
};

let clock: Clock;
let orders: FakeOrderRepo;
let catalogRepo: FakeCatalogRepo;
let deps: PlaceOrderDeps;
let n = 0;

const delivery = (over: Partial<PlaceOrderInput> = {}): PlaceOrderInput => ({
  phone: "+201012345678",
  idempotencyKey: "key-0001-abcdefgh",
  service: "delivery",
  location: near,
  address: { landmark: "next to the mosque" },
  paymentMethod: "cod",
  lines: [pizza],
  ...over,
});

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
  catalogRepo = new FakeCatalogRepo();
  n = 0;
  deps = { catalog: catalogRepo, orders, newToken: () => `token-${++n}`, fingerprint, now: clock.now };
});

describe("priceCart", () => {
  it("adds the zone delivery fee and returns server totals", async () => {
    const res = await priceCart(deps.catalog, { service: "delivery", location: near, lines: [pizza] });
    expect(res.priced.subtotal).toBe(15000 + 2000 + 1500);
    expect(res.priced.total).toBe(res.priced.subtotal + 2000);
    expect(res.fulfilment.branchId).toBe(1);
  });

  it("charges no delivery fee for pickup at an open branch", async () => {
    const res = await priceCart(deps.catalog, { service: "pickup", branchId: 1, lines: [pizza] });
    expect(res.priced.deliveryFee).toBe(0);
  });

  it("rejects closed or unknown pickup branches", async () => {
    expect(await code(priceCart(deps.catalog, { service: "pickup", branchId: 2, lines: [pizza] }))).toBe("BRANCH_UNAVAILABLE");
    expect(await code(priceCart(deps.catalog, { service: "pickup", branchId: 99, lines: [pizza] }))).toBe("BRANCH_UNAVAILABLE");
    expect(await code(priceCart(deps.catalog, { service: "pickup", lines: [pizza] }))).toBe("BRANCH_UNAVAILABLE");
  });

  it("rejects delivery outside the zone, without a location, or with bad coordinates", async () => {
    expect(await code(priceCart(deps.catalog, { service: "delivery", location: far, lines: [pizza] }))).toBe("OUT_OF_ZONE");
    expect(await code(priceCart(deps.catalog, { service: "delivery", lines: [pizza] }))).toBe("INVALID_REQUEST");
    expect(await code(priceCart(deps.catalog, { service: "delivery", location: { lat: 200, lng: 0 }, lines: [pizza] }))).toBe("INVALID_REQUEST");
  });

  it("rejects carts below the zone minimum", async () => {
    const cheap: LineInput = { qty: 1, halves: [{ half: "whole", itemId: 3, sizeId: 30, toppings: [] }] };
    expect(await code(priceCart(deps.catalog, { service: "delivery", location: near, lines: [cheap] }))).toBe("BELOW_MINIMUM");
  });

  it("maps invalid cart contents to INVALID_CART", async () => {
    const bad: LineInput = { qty: 1, halves: [{ half: "whole", itemId: 999, sizeId: 10, toppings: [] }] };
    expect(await code(priceCart(deps.catalog, { service: "pickup", branchId: 1, lines: [bad] }))).toBe("INVALID_CART");
  });
});

describe("placeOrder", () => {
  it("persists server-computed totals with COD pending", async () => {
    const { order, replayed } = await placeOrder(deps, delivery());
    expect(replayed).toBe(false);
    expect(order).toMatchObject({ status: "PLACED", paymentStatus: "COD_PENDING", totalPiastres: 20500 });
    const stored = orders.stored.get(order.id)!.order;
    expect(stored.branchId).toBe(1);
    expect(stored.lines[0]).toMatchObject({ unitPricePiastres: 18500, crustId: 2 });
    expect(stored.lines[0]?.halves[0]?.toppings[0]).toEqual({ id: 1, action: "add", deltaPiastres: 1500 });
  });

  it("online orders start unpaid", async () => {
    const { order } = await placeOrder(deps, delivery({ paymentMethod: "online" }));
    expect(order.paymentStatus).toBe("UNPAID");
  });

  it("a retry with the same key and body returns the original order and creates nothing", async () => {
    const first = await placeOrder(deps, delivery());
    const second = await placeOrder(deps, delivery());
    expect(second.replayed).toBe(true);
    expect(second.order.id).toBe(first.order.id);
    expect(orders.stored.size).toBe(1);
  });

  it("a retry still gets the original order even if the menu or zones changed meanwhile", async () => {
    const first = await placeOrder(deps, delivery());
    catalogRepo.loadCatalog = async () => {
      throw new Error("catalog unavailable");
    };
    const retry = await placeOrder(deps, delivery());
    expect(retry.order.id).toBe(first.order.id);
  });

  it("rejects an idempotency key reused with a different request", async () => {
    await placeOrder(deps, delivery());
    const other: LineInput = { ...pizza, qty: 2 };
    expect(await code(placeOrder(deps, delivery({ lines: [other] })))).toBe("CONFLICT");
    expect(await code(placeOrder(deps, delivery({ note: "different note" })))).toBe("CONFLICT");
    expect(orders.stored.size).toBe(1);
  });

  it("the same key from a different phone is a different order", async () => {
    const a = await placeOrder(deps, delivery());
    const b = await placeOrder(deps, delivery({ phone: "+201055555555" }));
    expect(a.order.id).not.toBe(b.order.id);
  });

  it("limits orders per phone per hour, and the window slides", async () => {
    for (let i = 0; i < MAX_ORDERS_PER_HOUR; i++) {
      await placeOrder(deps, delivery({ idempotencyKey: `key-${i}-abcdefghijkl` }));
    }
    expect(await code(placeOrder(deps, delivery({ idempotencyKey: "key-extra-abcdefgh" })))).toBe("RATE_LIMITED");
    clock.advance(61 * 60 * 1000);
    await expect(placeOrder(deps, delivery({ idempotencyKey: "key-later-abcdefgh" }))).resolves.toMatchObject({ replayed: false });
  });

  it("enforces the hourly cap inside create() too, so parallel requests cannot slip past the early check", async () => {
    for (let i = 0; i < MAX_ORDERS_PER_HOUR; i++) {
      await placeOrder(deps, delivery({ idempotencyKey: `key-${i}-abcdefghijkl` }));
    }
    // Simulate requests that all passed the early check before any of them inserted.
    const blindCount = Object.assign(Object.create(orders) as FakeOrderRepo, { countSince: async () => 0 });
    const racing: PlaceOrderDeps = { ...deps, orders: blindCount };
    expect(await code(placeOrder(racing, delivery({ idempotencyKey: "key-late-abcdefghijk" })))).toBe("RATE_LIMITED");
    expect(orders.stored.size).toBe(MAX_ORDERS_PER_HOUR);
  });

  it("requires an address for delivery and stores none for pickup", async () => {
    expect(await code(placeOrder(deps, delivery({ address: undefined })))).toBe("INVALID_REQUEST");
    const { order } = await placeOrder(deps, delivery({ service: "pickup", branchId: 1, location: undefined, address: undefined }));
    expect(orders.stored.get(order.id)!.order.address).toBeNull();
  });

  it("rejects invalid coordinates before touching storage", async () => {
    expect(await code(placeOrder(deps, delivery({ location: { lat: 200, lng: 0 } })))).toBe("INVALID_REQUEST");
    expect(orders.stored.size).toBe(0);
  });

  it("rejects oversized orders", async () => {
    const many: LineInput = { ...pizza, qty: 50 };
    expect(await code(placeOrder(deps, delivery({ lines: [many, many] })))).toBe("INVALID_CART");
  });
});
