/** Staff-facing catalog and operations management. Every write is recorded in the audit log by the adapter. */

export interface AdminItem {
  readonly id: number;
  readonly categoryId: number;
  readonly kind: "pizza" | "side" | "drink" | "dessert";
  readonly nameAr: string;
  readonly nameEn: string | null;
  readonly descriptionAr: string | null;
  readonly descriptionEn: string | null;
  readonly imageUrl: string | null;
  readonly isAvailable: boolean;
  readonly sizes: readonly { readonly id: number; readonly label: string; readonly pricePiastres: number }[];
}

export interface NewItem {
  readonly categoryId: number;
  readonly kind: AdminItem["kind"];
  readonly nameAr: string;
  readonly nameEn?: string;
  readonly descriptionAr?: string;
  readonly descriptionEn?: string;
  readonly imageUrl?: string;
  readonly sizes: readonly { readonly label: string; readonly pricePiastres: number }[];
}

export interface ItemPatch {
  readonly nameAr?: string;
  readonly nameEn?: string | null;
  readonly descriptionAr?: string | null;
  readonly descriptionEn?: string | null;
  readonly imageUrl?: string | null;
  readonly categoryId?: number;
  readonly isAvailable?: boolean;
}

export interface AdminTopping {
  readonly id: number;
  readonly nameAr: string;
  readonly nameEn: string | null;
  readonly priceDeltaPiastres: number;
  readonly isAvailable: boolean;
}

export interface AdminCrust {
  readonly id: number;
  readonly nameAr: string;
  readonly nameEn: string | null;
  readonly priceDeltaPiastres: number;
}

export interface AdminZone {
  readonly id: number;
  readonly branchId: number;
  readonly name: string;
  readonly radiusM: number;
  readonly feePiastres: number;
  readonly minOrderPiastres: number;
  readonly etaMinutes: number | null;
}

export interface AdminBranch {
  readonly id: number;
  readonly nameAr: string;
  readonly nameEn: string | null;
  readonly phone: string | null;
  readonly isOpen: boolean;
}

export interface DailyReport {
  readonly date: string;
  readonly orders: Readonly<Record<string, number>>;
  readonly revenuePiastres: number;
  readonly cod: {
    readonly expectedPiastres: number;
    readonly collectedPiastres: number;
    readonly outstandingPiastres: number;
  };
  /** `paidPiastres` excludes cancelled orders; `refundDuePiastres` is money received that must be returned. */
  readonly online: { readonly paidPiastres: number; readonly refundDuePiastres: number };
}

export interface AdminOrderRow {
  readonly id: number;
  readonly status: string;
  readonly service: string;
  readonly paymentMethod: string;
  readonly paymentStatus: string;
  readonly totalPiastres: number;
  readonly createdAt: string;
  readonly customerPhone: string;
}

export type AdminResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: "not_found" | "in_use" };

export interface AdminRepository {
  listItems(): Promise<readonly AdminItem[]>;
  createItem(actor: string, item: NewItem): Promise<AdminItem>;
  updateItem(actor: string, id: number, patch: ItemPatch): Promise<AdminResult<AdminItem>>;
  setSizePrice(actor: string, sizeId: number, pricePiastres: number): Promise<AdminResult<null>>;

  listToppings(): Promise<readonly AdminTopping[]>;
  setToppingPrice(actor: string, id: number, priceDeltaPiastres: number): Promise<AdminResult<null>>;
  setToppingAvailability(actor: string, id: number, isAvailable: boolean): Promise<AdminResult<null>>;

  listCrusts(): Promise<readonly AdminCrust[]>;
  setCrustPrice(actor: string, id: number, priceDeltaPiastres: number): Promise<AdminResult<null>>;

  listZones(): Promise<readonly AdminZone[]>;
  createZone(actor: string, zone: Omit<AdminZone, "id">): Promise<AdminZone>;
  updateZone(actor: string, id: number, patch: Partial<Omit<AdminZone, "id" | "branchId">>): Promise<AdminResult<AdminZone>>;
  deleteZone(actor: string, id: number): Promise<AdminResult<null>>;

  listBranches(): Promise<readonly AdminBranch[]>;
  setBranchOpen(actor: string, id: number, isOpen: boolean): Promise<AdminResult<null>>;

  listOrders(filter: { date?: string; status?: string; limit: number }): Promise<readonly AdminOrderRow[]>;
  dailyReport(date: string): Promise<DailyReport>;
}
