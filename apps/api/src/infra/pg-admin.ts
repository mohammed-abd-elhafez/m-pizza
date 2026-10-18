import type { Pool, PoolClient } from "pg";
import type {
  AdminBranch,
  AdminCrust,
  AdminItem,
  AdminOrderRow,
  AdminRepository,
  AdminResult,
  AdminTopping,
  AdminZone,
  DailyReport,
  ItemPatch,
  NewItem,
} from "../application/admin-ports";

const NOT_FOUND = { ok: false, reason: "not_found" } as const;
const ok = <T>(value: T): AdminResult<T> => ({ ok: true, value });

interface ItemRow {
  id: number;
  category_id: number;
  kind: AdminItem["kind"];
  name_ar: string;
  name_en: string | null;
  description_ar: string | null;
  description_en: string | null;
  image_url: string | null;
  is_available: boolean;
}

interface SizeRow {
  id: number;
  item_id: number;
  label: string;
  price_piastres: number;
}

const toItem = (r: ItemRow, sizes: readonly SizeRow[]): AdminItem => ({
  id: r.id,
  categoryId: r.category_id,
  kind: r.kind,
  nameAr: r.name_ar,
  nameEn: r.name_en,
  descriptionAr: r.description_ar,
  descriptionEn: r.description_en,
  imageUrl: r.image_url,
  isAvailable: r.is_available,
  sizes: sizes.filter((s) => s.item_id === r.id).map((s) => ({ id: s.id, label: s.label, pricePiastres: s.price_piastres })),
});

const ITEM_COLUMNS = "id, category_id, kind, name_ar, name_en, description_ar, description_en, image_url, is_available";

/** Column names come from this fixed map only, never from request keys. */
const ITEM_PATCH_COLUMNS: Readonly<Record<keyof ItemPatch, string>> = {
  categoryId: "category_id",
  nameAr: "name_ar",
  nameEn: "name_en",
  descriptionAr: "description_ar",
  descriptionEn: "description_en",
  imageUrl: "image_url",
  isAvailable: "is_available",
};

const ZONE_PATCH_COLUMNS = {
  name: "name",
  radiusM: "radius_m",
  feePiastres: "fee_piastres",
  minOrderPiastres: "min_order_piastres",
  etaMinutes: "eta_minutes",
} as const;

interface ZoneRow {
  id: number;
  branch_id: number;
  name: string;
  radius_m: number;
  fee_piastres: number;
  min_order_piastres: number;
  eta_minutes: number | null;
}

const toZone = (r: ZoneRow): AdminZone => ({
  id: r.id,
  branchId: r.branch_id,
  name: r.name,
  radiusM: r.radius_m,
  feePiastres: r.fee_piastres,
  minOrderPiastres: r.min_order_piastres,
  etaMinutes: r.eta_minutes,
});

const ZONE_COLUMNS = "id, branch_id, name, radius_m, fee_piastres, min_order_piastres, eta_minutes";

export class PgAdminRepo implements AdminRepository {
  constructor(private readonly pool: Pool) {}

  async listItems(): Promise<readonly AdminItem[]> {
    const [items, sizes] = await Promise.all([
      this.pool.query<ItemRow>(`SELECT ${ITEM_COLUMNS} FROM items ORDER BY category_id, id`),
      this.pool.query<SizeRow>("SELECT id, item_id, label, price_piastres FROM item_sizes ORDER BY price_piastres, id"),
    ]);
    return items.rows.map((r) => toItem(r, sizes.rows));
  }

  async createItem(actor: string, item: NewItem): Promise<AdminItem> {
    return this.tx(async (db) => {
      const res = await db.query<ItemRow>(
        `INSERT INTO items (category_id, kind, name_ar, name_en, description_ar, description_en, image_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${ITEM_COLUMNS}`,
        [item.categoryId, item.kind, item.nameAr, item.nameEn ?? null, item.descriptionAr ?? null, item.descriptionEn ?? null, item.imageUrl ?? null],
      );
      const row = res.rows[0]!;
      const sizes: SizeRow[] = [];
      for (const s of item.sizes) {
        const r = await db.query<SizeRow>(
          "INSERT INTO item_sizes (item_id, label, price_piastres) VALUES ($1, $2, $3) RETURNING id, item_id, label, price_piastres",
          [row.id, s.label, s.pricePiastres],
        );
        sizes.push(r.rows[0]!);
      }
      await this.audit(db, actor, "item.create", `item:${row.id}`);
      return toItem(row, sizes);
    });
  }

  async updateItem(actor: string, id: number, patch: ItemPatch): Promise<AdminResult<AdminItem>> {
    return this.tx(async (db) => {
      const entries = (Object.keys(patch) as (keyof ItemPatch)[]).filter((k) => patch[k] !== undefined);
      if (entries.length === 0) return NOT_FOUND;
      const sets = entries.map((k, i) => `${ITEM_PATCH_COLUMNS[k]} = $${i + 2}`);
      const res = await db.query<ItemRow>(
        `UPDATE items SET ${sets.join(", ")} WHERE id = $1 RETURNING ${ITEM_COLUMNS}`,
        [id, ...entries.map((k) => patch[k])],
      );
      const row = res.rows[0];
      if (!row) return NOT_FOUND;
      const sizes = await db.query<SizeRow>("SELECT id, item_id, label, price_piastres FROM item_sizes WHERE item_id = $1 ORDER BY price_piastres, id", [id]);
      await this.audit(db, actor, "item.update", `item:${id}`);
      return ok(toItem(row, sizes.rows));
    });
  }

  setSizePrice(actor: string, sizeId: number, pricePiastres: number): Promise<AdminResult<null>> {
    return this.updateOne(actor, "UPDATE item_sizes SET price_piastres = $2 WHERE id = $1", [sizeId, pricePiastres], "size.price", `size:${sizeId}`);
  }

  async listToppings(): Promise<readonly AdminTopping[]> {
    const { rows } = await this.pool.query<{ id: number; name_ar: string; name_en: string | null; price_delta_piastres: number; is_available: boolean }>(
      "SELECT id, name_ar, name_en, price_delta_piastres, is_available FROM toppings ORDER BY id",
    );
    return rows.map((r) => ({ id: r.id, nameAr: r.name_ar, nameEn: r.name_en, priceDeltaPiastres: r.price_delta_piastres, isAvailable: r.is_available }));
  }

  setToppingPrice(actor: string, id: number, priceDeltaPiastres: number): Promise<AdminResult<null>> {
    return this.updateOne(actor, "UPDATE toppings SET price_delta_piastres = $2 WHERE id = $1", [id, priceDeltaPiastres], "topping.price", `topping:${id}`);
  }

  setToppingAvailability(actor: string, id: number, isAvailable: boolean): Promise<AdminResult<null>> {
    return this.updateOne(actor, "UPDATE toppings SET is_available = $2 WHERE id = $1", [id, isAvailable], "topping.availability", `topping:${id}`);
  }

  async listCrusts(): Promise<readonly AdminCrust[]> {
    const { rows } = await this.pool.query<{ id: number; name_ar: string; name_en: string | null; price_delta_piastres: number }>(
      "SELECT id, name_ar, name_en, price_delta_piastres FROM crusts ORDER BY id",
    );
    return rows.map((r) => ({ id: r.id, nameAr: r.name_ar, nameEn: r.name_en, priceDeltaPiastres: r.price_delta_piastres }));
  }

  setCrustPrice(actor: string, id: number, priceDeltaPiastres: number): Promise<AdminResult<null>> {
    return this.updateOne(actor, "UPDATE crusts SET price_delta_piastres = $2 WHERE id = $1", [id, priceDeltaPiastres], "crust.price", `crust:${id}`);
  }

  async listZones(): Promise<readonly AdminZone[]> {
    const { rows } = await this.pool.query<ZoneRow>(`SELECT ${ZONE_COLUMNS} FROM delivery_zones WHERE radius_m IS NOT NULL ORDER BY branch_id, radius_m`);
    return rows.map(toZone);
  }

  async createZone(actor: string, zone: Omit<AdminZone, "id">): Promise<AdminZone> {
    return this.tx(async (db) => {
      const res = await db.query<ZoneRow>(
        `INSERT INTO delivery_zones (branch_id, name, radius_m, fee_piastres, min_order_piastres, eta_minutes)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${ZONE_COLUMNS}`,
        [zone.branchId, zone.name, zone.radiusM, zone.feePiastres, zone.minOrderPiastres, zone.etaMinutes],
      );
      await this.audit(db, actor, "zone.create", `zone:${res.rows[0]!.id}`);
      return toZone(res.rows[0]!);
    });
  }

  async updateZone(actor: string, id: number, patch: Partial<Omit<AdminZone, "id" | "branchId">>): Promise<AdminResult<AdminZone>> {
    return this.tx(async (db) => {
      const keys = (Object.keys(patch) as (keyof typeof ZONE_PATCH_COLUMNS)[]).filter((k) => patch[k] !== undefined);
      if (keys.length === 0) return NOT_FOUND;
      const sets = keys.map((k, i) => `${ZONE_PATCH_COLUMNS[k]} = $${i + 2}`);
      const res = await db.query<ZoneRow>(`UPDATE delivery_zones SET ${sets.join(", ")} WHERE id = $1 RETURNING ${ZONE_COLUMNS}`, [id, ...keys.map((k) => patch[k])]);
      if (!res.rows[0]) return NOT_FOUND;
      await this.audit(db, actor, "zone.update", `zone:${id}`);
      return ok(toZone(res.rows[0]));
    });
  }

  async deleteZone(actor: string, id: number): Promise<AdminResult<null>> {
    return this.tx(async (db) => {
      const res = await db.query("DELETE FROM delivery_zones WHERE id = $1", [id]);
      if (res.rowCount !== 1) return NOT_FOUND;
      await this.audit(db, actor, "zone.delete", `zone:${id}`);
      return ok(null);
    });
  }

  async listBranches(): Promise<readonly AdminBranch[]> {
    const { rows } = await this.pool.query<{ id: number; name_ar: string; name_en: string | null; phone: string | null; is_open: boolean }>(
      "SELECT id, name_ar, name_en, phone, is_open FROM branches ORDER BY id",
    );
    return rows.map((r) => ({ id: r.id, nameAr: r.name_ar, nameEn: r.name_en, phone: r.phone, isOpen: r.is_open }));
  }

  setBranchOpen(actor: string, id: number, isOpen: boolean): Promise<AdminResult<null>> {
    return this.updateOne(actor, "UPDATE branches SET is_open = $2 WHERE id = $1", [id, isOpen], "branch.open", `branch:${id}`);
  }

  async listOrders(filter: { date?: string; status?: string; limit: number }): Promise<readonly AdminOrderRow[]> {
    const { rows } = await this.pool.query<{
      id: number; status: string; service: string; payment_method: string; payment_status: string;
      total_piastres: number; created_at: Date; phone: string;
    }>(
      `SELECT o.id, o.status, o.service, o.payment_method, o.payment_status, o.total_piastres, o.created_at, c.phone
         FROM orders o JOIN customers c ON c.id = o.customer_id
        WHERE ($1::date IS NULL OR (o.created_at AT TIME ZONE 'Africa/Cairo')::date = $1::date)
          AND ($2::text IS NULL OR o.status = $2)
        ORDER BY o.created_at DESC, o.id DESC LIMIT $3`,
      [filter.date ?? null, filter.status ?? null, filter.limit],
    );
    return rows.map((r) => ({
      id: r.id, status: r.status, service: r.service, paymentMethod: r.payment_method, paymentStatus: r.payment_status,
      totalPiastres: r.total_piastres, createdAt: r.created_at.toISOString(), customerPhone: r.phone,
    }));
  }

  async dailyReport(date: string): Promise<DailyReport> {
    const day = "(created_at AT TIME ZONE 'Africa/Cairo')::date = $1::date";
    const refunds = await this.pool.query<{ due: string }>(
      `SELECT COALESCE(sum(p.amount_piastres), 0) AS due
         FROM payments p JOIN orders o ON o.id = p.order_id
        WHERE p.status = 'needs_refund' AND (o.created_at AT TIME ZONE 'Africa/Cairo')::date = $1::date`,
      [date],
    );
    const [byStatus, money] = await Promise.all([
      this.pool.query<{ status: string; n: string }>(`SELECT status, count(*) AS n FROM orders WHERE ${day} GROUP BY status`, [date]),
      this.pool.query<{ revenue: string; cod_expected: string; cod_collected: string; online_paid: string }>(
        `SELECT
           COALESCE(sum(total_piastres) FILTER (WHERE status IN ('DELIVERED','PICKED_UP')), 0) AS revenue,
           COALESCE(sum(total_piastres) FILTER (WHERE payment_method = 'cod' AND status <> 'CANCELLED'), 0) AS cod_expected,
           COALESCE(sum(total_piastres) FILTER (WHERE payment_status = 'COD_COLLECTED'), 0) AS cod_collected,
           COALESCE(sum(total_piastres) FILTER (WHERE payment_method = 'online' AND payment_status = 'PAID' AND status <> 'CANCELLED'), 0) AS online_paid
         FROM orders WHERE ${day}`,
        [date],
      ),
    ]);
    const m = money.rows[0]!;
    const expected = Number(m.cod_expected);
    const collected = Number(m.cod_collected);
    return {
      date,
      orders: Object.fromEntries(byStatus.rows.map((r) => [r.status, Number(r.n)])),
      revenuePiastres: Number(m.revenue),
      cod: { expectedPiastres: expected, collectedPiastres: collected, outstandingPiastres: expected - collected },
      online: { paidPiastres: Number(m.online_paid), refundDuePiastres: Number(refunds.rows[0]?.due ?? 0) },
    };
  }

  private async updateOne(actor: string, sql: string, params: unknown[], action: string, target: string): Promise<AdminResult<null>> {
    return this.tx(async (db) => {
      const res = await db.query(sql, params);
      if (res.rowCount !== 1) return NOT_FOUND;
      await this.audit(db, actor, action, target);
      return ok(null);
    });
  }

  private async audit(db: PoolClient, actor: string, action: string, target: string): Promise<void> {
    await db.query("INSERT INTO audit_log (actor, action, target, outcome) VALUES ($1, $2, $3, 'success')", [actor, action, target]);
  }

  private async tx<T>(work: (db: PoolClient) => Promise<T>): Promise<T> {
    const db = await this.pool.connect();
    try {
      await db.query("BEGIN");
      const result = await work(db);
      await db.query("COMMIT");
      return result;
    } catch (err) {
      await db.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      db.release();
    }
  }
}
