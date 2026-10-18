import { describe, expect, it } from "vitest";
import { priceLine, priceOrder, type Catalog, type HalfInput, type LineInput } from "../src/domain/pricing";

const catalog: Catalog = {
  items: {
    1: { id: 1, kind: "pizza", available: true },
    2: { id: 2, kind: "pizza", available: true },
    3: { id: 3, kind: "drink", available: true },
    4: { id: 4, kind: "pizza", available: false },
  },
  sizes: {
    10: { itemId: 1, label: "S", price: 15000 },
    11: { itemId: 1, label: "L", price: 20000 },
    20: { itemId: 2, label: "S", price: 17000 },
    21: { itemId: 2, label: "L", price: 24000 },
    30: { itemId: 3, label: "330ml", price: 2500 },
    40: { itemId: 4, label: "S", price: 10000 },
  },
  crusts: { 1: 0, 2: 2000 },
  toppings: { 1: { delta: 1500, available: true }, 2: { delta: 1000, available: true }, 3: { delta: 500, available: false } },
};

const whole = (over: Partial<HalfInput> = {}, line: Partial<LineInput> = {}): LineInput => ({
  halves: [{ half: "whole", itemId: 1, sizeId: 10, toppings: [], ...over }],
  crustId: 1,
  qty: 1,
  ...line,
});

describe("pricing", () => {
  it("prices a plain pizza by size", () => {
    expect(priceLine(catalog, whole()).unit).toBe(15000);
  });

  it("adds crust delta and topping adds; removes are free", () => {
    const line = whole({ toppings: [{ id: 1, action: "add" }, { id: 2, action: "remove" }] }, { crustId: 2 });
    expect(priceLine(catalog, line).unit).toBe(15000 + 2000 + 1500);
  });

  it("half-and-half uses the higher base price plus each half's toppings", () => {
    const line: LineInput = {
      crustId: 1,
      qty: 1,
      halves: [
        { half: "left", itemId: 1, sizeId: 10, toppings: [{ id: 1, action: "add" }] },
        { half: "right", itemId: 2, sizeId: 20, toppings: [] },
      ],
    };
    expect(priceLine(catalog, line).unit).toBe(17000 + 1500);
  });

  it("requires left+right for half-and-half and a single whole otherwise", () => {
    const left: HalfInput = { half: "left", itemId: 1, sizeId: 10, toppings: [] };
    expect(() => priceLine(catalog, { crustId: 1, qty: 1, halves: [left] })).toThrow(/halves/i);
    expect(() => priceLine(catalog, { crustId: 1, qty: 1, halves: [] })).toThrow(/halves/i);
  });

  it("multiplies by qty and sums the order", () => {
    const drink: LineInput = { halves: [{ half: "whole", itemId: 3, sizeId: 30, toppings: [] }], qty: 1 };
    const res = priceOrder(catalog, [whole({}, { qty: 2 }), drink], 3000);
    expect(res.subtotal).toBe(32500);
    expect(res.total).toBe(35500);
  });

  it("rejects unavailable items, toppings, unknown ids and bad qty", () => {
    expect(() => priceLine(catalog, whole({ itemId: 4, sizeId: 40 }))).toThrow(/unavailable/i);
    expect(() => priceLine(catalog, whole({ toppings: [{ id: 3, action: "add" }] }))).toThrow(/unavailable/i);
    expect(() => priceLine(catalog, whole({ sizeId: 999 }))).toThrow(/unknown/i);
    expect(() => priceLine(catalog, whole({}, { crustId: 99 }))).toThrow(/unknown/i);
    expect(() => priceLine(catalog, whole({}, { qty: 0 }))).toThrow(/qty/i);
    expect(() => priceLine(catalog, whole({}, { qty: 1.5 }))).toThrow(/qty/i);
  });

  it("rejects a size that does not belong to the item", () => {
    expect(() => priceLine(catalog, whole({ sizeId: 20 }))).toThrow(/size/i);
  });
});

describe("pricing: business-rule hardening", () => {
  const half = (h: "left" | "right", itemId: number, sizeId: number): HalfInput => ({ half: h, itemId, sizeId, toppings: [] });

  it("rejects half-and-half with mismatched size labels", () => {
    expect(() => priceLine(catalog, { crustId: 1, qty: 1, halves: [half("left", 1, 10), half("right", 2, 21)] })).toThrow(/size/i);
  });

  it("rejects half-and-half for non-pizza items", () => {
    const drink = (h: "left" | "right"): HalfInput => ({ half: h, itemId: 3, sizeId: 30, toppings: [] });
    expect(() => priceLine(catalog, { qty: 1, halves: [drink("left"), drink("right")] })).toThrow(/pizza/i);
  });

  it("rejects crust or toppings on non-pizza items", () => {
    const d = { itemId: 3, sizeId: 30 };
    expect(() => priceLine(catalog, whole(d, { crustId: 2 }))).toThrow(/pizza/i);
    expect(() => priceLine(catalog, whole({ ...d, toppings: [{ id: 1, action: "add" }] }))).toThrow(/pizza/i);
  });

  it("rejects duplicate topping entries within a half (no double charge)", () => {
    const dup = [{ id: 1, action: "add" as const }, { id: 1, action: "add" as const }];
    expect(() => priceLine(catalog, whole({ toppings: dup }))).toThrow(/duplicate/i);
    const addRemove = [{ id: 1, action: "add" as const }, { id: 1, action: "remove" as const }];
    expect(() => priceLine(catalog, whole({ toppings: addRemove }))).toThrow(/duplicate/i);
  });

  it("bounds qty and validates the delivery fee", () => {
    expect(() => priceLine(catalog, whole({}, { qty: 51 }))).toThrow(/qty/i);
    expect(() => priceOrder(catalog, [whole()], -1)).toThrow(/fee/i);
    expect(() => priceOrder(catalog, [whole()], 10.5)).toThrow(/fee/i);
    expect(() => priceOrder(catalog, [], 0)).toThrow(/no lines/i);
  });
});

describe("pricing: order size caps", () => {
  const pizzaLine = (qty: number, toppings: number): LineInput => ({
    crustId: 1,
    qty,
    halves: [{
      half: "whole", itemId: 1, sizeId: 10,
      toppings: Array.from({ length: toppings }, (_, i) => ({ id: 1 + (i % 2), action: "add" as const })).slice(0, 2),
    }],
  });

  it("rejects an order with too many units in total", () => {
    const lines = [50, 11].map((q) => whole({}, { qty: q }));
    expect(() => priceOrder(catalog, lines, 0)).toThrow(/too many items/i);
  });

  it("rejects an order whose value exceeds the cap", () => {
    expect(() => priceOrder(catalog, [whole({}, { qty: 30 })], 0, { maxTotalPiastres: 500_000 })).not.toThrow();
    expect(() => priceOrder(catalog, [whole({}, { qty: 30 })], 0, { maxTotalPiastres: 100_000 })).toThrow(/too large/i);
  });

  it("accepts a normal order under the caps", () => {
    expect(priceOrder(catalog, [pizzaLine(2, 2)], 0).total).toBeGreaterThan(0);
  });
});