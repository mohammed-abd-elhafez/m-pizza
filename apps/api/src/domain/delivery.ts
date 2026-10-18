export interface Point {
  readonly lat: number;
  readonly lng: number;
}

export interface Branch extends Point {
  readonly id: number;
  readonly isOpen: boolean;
}

export interface DeliveryZone {
  readonly id: number;
  readonly branchId: number;
  readonly name: string;
  readonly radiusM: number;
  readonly feePiastres: number;
  readonly minOrderPiastres: number;
  readonly etaMinutes: number | null;
}

export interface DeliveryQuote {
  readonly zoneId: number;
  readonly branchId: number;
  readonly feePiastres: number;
  readonly minOrderPiastres: number;
  readonly etaMinutes: number | null;
}

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number): number => (deg * Math.PI) / 180;

export function distanceMeters(a: Point, b: Point): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function assertValidPoint(p: Point): void {
  const ok = Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
  if (!ok) throw new RangeError("Invalid coordinates");
}

/** Nearest open branch whose zone contains the point; within a branch, the smallest (innermost) zone wins. */
export function quoteDelivery(
  branches: readonly Branch[],
  zones: readonly DeliveryZone[],
  point: Point,
): DeliveryQuote | null {
  assertValidPoint(point);
  const openById = new Map(branches.filter((b) => b.isOpen).map((b) => [b.id, b]));

  let best: { zone: DeliveryZone; branchDistance: number } | null = null;
  for (const zone of zones) {
    const branch = openById.get(zone.branchId);
    if (!branch) continue;
    const branchDistance = distanceMeters(branch, point);
    if (branchDistance > zone.radiusM) continue;
    const better =
      best === null ||
      branchDistance < best.branchDistance ||
      (branchDistance === best.branchDistance && zone.radiusM < best.zone.radiusM);
    if (better) best = { zone, branchDistance };
  }

  if (!best) return null;
  const z = best.zone;
  return {
    zoneId: z.id,
    branchId: z.branchId,
    feePiastres: z.feePiastres,
    minOrderPiastres: z.minOrderPiastres,
    etaMinutes: z.etaMinutes,
  };
}
