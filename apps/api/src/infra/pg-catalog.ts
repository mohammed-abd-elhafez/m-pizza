import type { Pool } from "pg";
import type { CatalogRepository, DeliveryNetwork, MenuItemView, MenuView } from "../application/ports";
import type { Catalog } from "../domain/pricing";

type Kind = "pizza" | "side" | "drink" | "dessert";

export class PgCatalogRepo implements CatalogRepository {
  constructor(private readonly pool: Pool) {}

  async loadCatalog(): Promise<Catalog> {
    const [items, sizes, crusts, toppings] = await Promise.all([
      this.pool.query<{ id: number; kind: Kind; is_available: boolean }>("SELECT id, kind, is_available FROM items"),
      this.pool.query<{ id: number; item_id: number; label: string; price_piastres: number }>(
        "SELECT id, item_id, label, price_piastres FROM item_sizes",
      ),
      this.pool.query<{ id: number; price_delta_piastres: number }>("SELECT id, price_delta_piastres FROM crusts"),
      this.pool.query<{ id: number; price_delta_piastres: number; is_available: boolean }>(
        "SELECT id, price_delta_piastres, is_available FROM toppings",
      ),
    ]);

    return {
      items: Object.fromEntries(items.rows.map((r) => [r.id, { id: r.id, kind: r.kind, available: r.is_available }])),
      sizes: Object.fromEntries(
        sizes.rows.map((r) => [r.id, { itemId: r.item_id, label: r.label, price: r.price_piastres }]),
      ),
      crusts: Object.fromEntries(crusts.rows.map((r) => [r.id, r.price_delta_piastres])),
      toppings: Object.fromEntries(
        toppings.rows.map((r) => [r.id, { delta: r.price_delta_piastres, available: r.is_available }]),
      ),
    };
  }

  async loadDeliveryNetwork(): Promise<DeliveryNetwork> {
    const [branches, zones] = await Promise.all([
      this.pool.query<{ id: number; lat: string; lng: string; is_open: boolean }>(
        "SELECT id, lat, lng, is_open FROM branches WHERE lat IS NOT NULL AND lng IS NOT NULL",
      ),
      this.pool.query<{
        id: number;
        branch_id: number;
        name: string;
        radius_m: number;
        fee_piastres: number;
        min_order_piastres: number;
        eta_minutes: number | null;
      }>(
        "SELECT id, branch_id, name, radius_m, fee_piastres, min_order_piastres, eta_minutes FROM delivery_zones WHERE radius_m IS NOT NULL",
      ),
    ]);

    return {
      branches: branches.rows.map((r) => ({ id: r.id, lat: Number(r.lat), lng: Number(r.lng), isOpen: r.is_open })),
      zones: zones.rows.map((r) => ({
        id: r.id,
        branchId: r.branch_id,
        name: r.name,
        radiusM: r.radius_m,
        feePiastres: r.fee_piastres,
        minOrderPiastres: r.min_order_piastres,
        etaMinutes: r.eta_minutes,
      })),
    };
  }

  async loadMenu(): Promise<MenuView> {
    const [categories, items, sizes, crusts, toppings] = await Promise.all([
      this.pool.query<{ id: number; name_ar: string; name_en: string | null }>(
        "SELECT id, name_ar, name_en FROM categories WHERE is_active ORDER BY sort_order, id",
      ),
      this.pool.query<{
        id: number;
        category_id: number;
        kind: string;
        name_ar: string;
        name_en: string | null;
        description_ar: string | null;
        description_en: string | null;
        image_url: string | null;
      }>(
        "SELECT id, category_id, kind, name_ar, name_en, description_ar, description_en, image_url FROM items WHERE is_available ORDER BY id",
      ),
      this.pool.query<{ id: number; item_id: number; label: string; price_piastres: number }>(
        "SELECT id, item_id, label, price_piastres FROM item_sizes ORDER BY price_piastres, id",
      ),
      this.pool.query<{ id: number; name_ar: string; name_en: string | null; price_delta_piastres: number }>(
        "SELECT id, name_ar, name_en, price_delta_piastres FROM crusts ORDER BY id",
      ),
      this.pool.query<{ id: number; name_ar: string; name_en: string | null; price_delta_piastres: number }>(
        "SELECT id, name_ar, name_en, price_delta_piastres FROM toppings WHERE is_available ORDER BY id",
      ),
    ]);

    const itemViews = new Map<number, MenuItemView[]>();
    for (const i of items.rows) {
      const view: MenuItemView = {
        id: i.id,
        kind: i.kind,
        nameAr: i.name_ar,
        nameEn: i.name_en,
        descriptionAr: i.description_ar,
        descriptionEn: i.description_en,
        imageUrl: i.image_url,
        sizes: sizes.rows
          .filter((s) => s.item_id === i.id)
          .map((s) => ({ id: s.id, label: s.label, pricePiastres: s.price_piastres })),
      };
      itemViews.set(i.category_id, [...(itemViews.get(i.category_id) ?? []), view]);
    }

    return {
      categories: categories.rows.map((c) => ({
        id: c.id,
        nameAr: c.name_ar,
        nameEn: c.name_en,
        items: itemViews.get(c.id) ?? [],
      })),
      crusts: crusts.rows.map((c) => ({ id: c.id, nameAr: c.name_ar, nameEn: c.name_en, priceDeltaPiastres: c.price_delta_piastres })),
      toppings: toppings.rows.map((t) => ({ id: t.id, nameAr: t.name_ar, nameEn: t.name_en, priceDeltaPiastres: t.price_delta_piastres })),
    };
  }
}
