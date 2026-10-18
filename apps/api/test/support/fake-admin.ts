import type {
  AdminBranch,
  AdminCrust,
  AdminItem,
  AdminRepository,
  AdminResult,
  AdminTopping,
  AdminZone,
  DailyReport,
  ItemPatch,
  NewItem,
} from "../../src/application/admin-ports";

const notFound = { ok: false, reason: "not_found" } as const;

/** Small in-memory admin repository: enough behaviour to exercise routing, validation and authorisation. */
export class FakeAdminRepo implements AdminRepository {
  readonly audit: string[] = [];
  items: AdminItem[] = [];
  zones: AdminZone[] = [{ id: 1, branchId: 1, name: "near", radiusM: 3000, feePiastres: 2000, minOrderPiastres: 0, etaMinutes: 30 }];

  async listItems() {
    return this.items;
  }
  async createItem(actor: string, item: NewItem): Promise<AdminItem> {
    const created: AdminItem = {
      id: this.items.length + 1, categoryId: item.categoryId, kind: item.kind, nameAr: item.nameAr,
      nameEn: item.nameEn ?? null, descriptionAr: item.descriptionAr ?? null, descriptionEn: item.descriptionEn ?? null,
      imageUrl: item.imageUrl ?? null, isAvailable: true,
      sizes: item.sizes.map((s, i) => ({ id: i + 1, ...s })),
    };
    this.items.push(created);
    this.audit.push(`${actor}:item.create`);
    return created;
  }
  async updateItem(actor: string, id: number, patch: ItemPatch): Promise<AdminResult<AdminItem>> {
    const idx = this.items.findIndex((i) => i.id === id);
    if (idx < 0) return notFound;
    this.items[idx] = { ...this.items[idx]!, ...(patch as Partial<AdminItem>) };
    this.audit.push(`${actor}:item.update`);
    return { ok: true, value: this.items[idx]! };
  }
  async setSizePrice(actor: string, sizeId: number): Promise<AdminResult<null>> {
    this.audit.push(`${actor}:size.price`);
    return sizeId === 1 ? { ok: true, value: null } : notFound;
  }
  async listToppings(): Promise<readonly AdminTopping[]> {
    return [];
  }
  async setToppingPrice(): Promise<AdminResult<null>> {
    return { ok: true, value: null };
  }
  async setToppingAvailability(): Promise<AdminResult<null>> {
    return { ok: true, value: null };
  }
  async listCrusts(): Promise<readonly AdminCrust[]> {
    return [];
  }
  async setCrustPrice(): Promise<AdminResult<null>> {
    return { ok: true, value: null };
  }
  async listZones() {
    return this.zones;
  }
  async createZone(actor: string, zone: Omit<AdminZone, "id">): Promise<AdminZone> {
    const created = { id: this.zones.length + 1, ...zone };
    this.zones.push(created);
    this.audit.push(`${actor}:zone.create`);
    return created;
  }
  async updateZone(actor: string, id: number, patch: Partial<Omit<AdminZone, "id" | "branchId">>): Promise<AdminResult<AdminZone>> {
    const idx = this.zones.findIndex((z) => z.id === id);
    if (idx < 0) return notFound;
    this.zones[idx] = { ...this.zones[idx]!, ...patch };
    this.audit.push(`${actor}:zone.update`);
    return { ok: true, value: this.zones[idx]! };
  }
  async deleteZone(actor: string, id: number): Promise<AdminResult<null>> {
    const before = this.zones.length;
    this.zones = this.zones.filter((z) => z.id !== id);
    this.audit.push(`${actor}:zone.delete`);
    return this.zones.length < before ? { ok: true, value: null } : notFound;
  }
  async listBranches(): Promise<readonly AdminBranch[]> {
    return [];
  }
  async setBranchOpen(): Promise<AdminResult<null>> {
    return { ok: true, value: null };
  }
  async listOrders() {
    return [];
  }
  async dailyReport(date: string): Promise<DailyReport> {
    return {
      date, orders: {}, revenuePiastres: 0,
      cod: { expectedPiastres: 0, collectedPiastres: 0, outstandingPiastres: 0 },
      online: { paidPiastres: 0, refundDuePiastres: 0 },
    };
  }
}
