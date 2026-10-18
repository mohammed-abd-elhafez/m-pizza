import { describe, expect, it } from "vitest";
import { distanceMeters, quoteDelivery, type Branch, type DeliveryZone } from "../src/domain/delivery";

const branches: Branch[] = [
  { id: 1, lat: 30.0444, lng: 31.2357, isOpen: true },
  { id: 2, lat: 30.0444, lng: 31.2357, isOpen: false },
];
const zones: DeliveryZone[] = [
  { id: 1, branchId: 1, name: "near", radiusM: 3000, feePiastres: 2000, minOrderPiastres: 5000, etaMinutes: 30 },
  { id: 2, branchId: 1, name: "far", radiusM: 6000, feePiastres: 3500, minOrderPiastres: 10000, etaMinutes: 45 },
  { id: 3, branchId: 2, name: "closed-branch", radiusM: 9000, feePiastres: 100, minOrderPiastres: 0, etaMinutes: 10 },
];

// ~0.009 deg latitude is ~1 km
const at = (km: number) => ({ lat: 30.0444 + km * 0.009, lng: 31.2357 });

describe("distanceMeters", () => {
  it("is ~1112 m per 0.01 degree of latitude", () => {
    const d = distanceMeters({ lat: 30, lng: 31 }, { lat: 30.01, lng: 31 });
    expect(Math.round(d / 10)).toBe(111);
  });
  it("is zero for identical points", () => {
    expect(distanceMeters(at(0), at(0))).toBe(0);
  });
});

describe("quoteDelivery", () => {
  it("picks the innermost zone containing the point", () => {
    expect(quoteDelivery(branches, zones, at(1))?.zoneId).toBe(1);
    expect(quoteDelivery(branches, zones, at(4))?.zoneId).toBe(2);
  });

  it("returns fee, minimum, eta and the serving branch", () => {
    expect(quoteDelivery(branches, zones, at(1))).toEqual({
      zoneId: 1, branchId: 1, feePiastres: 2000, minOrderPiastres: 5000, etaMinutes: 30,
    });
  });

  it("returns null outside every zone", () => {
    expect(quoteDelivery(branches, zones, at(20))).toBeNull();
  });

  it("ignores zones of closed branches", () => {
    expect(quoteDelivery(branches, zones, at(8))).toBeNull();
  });

  it("prefers the nearest open branch", () => {
    const two: Branch[] = [
      { id: 1, lat: 30.0444, lng: 31.2357, isOpen: true },
      { id: 5, lat: 30.0444 + 0.045, lng: 31.2357, isOpen: true },
    ];
    const z: DeliveryZone[] = [
      { id: 1, branchId: 1, name: "a", radiusM: 9000, feePiastres: 1, minOrderPiastres: 0, etaMinutes: 1 },
      { id: 2, branchId: 5, name: "b", radiusM: 9000, feePiastres: 2, minOrderPiastres: 0, etaMinutes: 2 },
    ];
    expect(quoteDelivery(two, z, { lat: 30.0444 + 0.04, lng: 31.2357 })?.branchId).toBe(5);
  });

  it("rejects invalid coordinates", () => {
    expect(() => quoteDelivery(branches, zones, { lat: 91, lng: 0 })).toThrow(/coordinates/i);
    expect(() => quoteDelivery(branches, zones, { lat: Number.NaN, lng: 0 })).toThrow(/coordinates/i);
    expect(() => quoteDelivery(branches, zones, { lat: 0, lng: 181 })).toThrow(/coordinates/i);
  });
});
