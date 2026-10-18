import { describe, expect, it } from "vitest";
import { canTransition, nextStatuses, transition } from "../src/domain/order-state-machine";

describe("order state machine", () => {
  it("allows the delivery happy path", () => {
    const path = ["PLACED", "ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED"] as const;
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i]!, path[i + 1]!, "delivery")).toBe(true);
    }
  });

  it("pickup skips courier stages and ends at PICKED_UP", () => {
    expect(canTransition("READY", "PICKED_UP", "pickup")).toBe(true);
    expect(canTransition("READY", "OUT_FOR_DELIVERY", "pickup")).toBe(false);
    expect(canTransition("READY", "PICKED_UP", "delivery")).toBe(false);
  });

  it("rejects skipping and going backwards", () => {
    expect(canTransition("PLACED", "READY", "delivery")).toBe(false);
    expect(canTransition("READY", "PREPARING", "delivery")).toBe(false);
  });

  it("allows cancel from any non-final stage only with a reason", () => {
    for (const s of ["PLACED", "ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY"] as const) {
      expect(canTransition(s, "CANCELLED", "delivery")).toBe(true);
    }
    expect(() => transition("PLACED", "CANCELLED", "delivery", "kitchen")).toThrow(/reason/i);
    expect(transition("PLACED", "CANCELLED", "delivery", "kitchen", "customer asked").to).toBe("CANCELLED");
  });

  it("final states have no exits", () => {
    for (const s of ["DELIVERED", "PICKED_UP", "CANCELLED"] as const) {
      expect(nextStatuses(s, "delivery")).toEqual([]);
      expect(nextStatuses(s, "pickup")).toEqual([]);
    }
  });

  it("transition returns an immutable event record", () => {
    const ev = transition("PLACED", "ACCEPTED", "delivery", "kitchen");
    expect(ev).toMatchObject({ from: "PLACED", to: "ACCEPTED", actor: "kitchen" });
    expect(Object.isFrozen(ev)).toBe(true);
  });

  it("throws on illegal transition", () => {
    expect(() => transition("PLACED", "DELIVERED", "delivery", "kitchen")).toThrow(/illegal/i);
  });
});
