import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../../application/errors";
import type { AdminResult } from "../../application/admin-ports";
import { requireStaff } from "../auth-hooks";
import type { AppDeps } from "../deps";
import { freeText, idParamSchema, orderStatusSchema } from "../schemas";

const PG_INT_MAX = 2_147_483_647;
const id = z.number().int().positive().max(PG_INT_MAX);
const piastres = z.number().int().min(0).max(10_000_000);
const text = (max: number) => freeText({ min: 1, max });
const optText = (max: number) => freeText({ max });

const itemKind = z.enum(["pizza", "side", "drink", "dessert"]);

const newItemSchema = z
  .object({
    categoryId: id,
    kind: itemKind,
    nameAr: text(100),
    nameEn: optText(100).optional(),
    descriptionAr: optText(300).optional(),
    descriptionEn: optText(300).optional(),
    imageUrl: z.string().url().max(500).startsWith("https://").optional(),
    sizes: z.array(z.object({ label: text(30), pricePiastres: piastres }).strict()).min(1).max(6),
  })
  .strict();

const itemPatchSchema = z
  .object({
    categoryId: id,
    nameAr: text(100),
    nameEn: optText(100).nullable(),
    descriptionAr: optText(300).nullable(),
    descriptionEn: optText(300).nullable(),
    imageUrl: z.string().url().max(500).startsWith("https://").nullable(),
    isAvailable: z.boolean(),
  })
  .partial()
  .strict()
  .refine((p) => Object.keys(p).length > 0, "Nothing to update");

const zoneBase = {
  name: text(60),
  radiusM: z.number().int().min(100).max(50_000),
  feePiastres: piastres,
  minOrderPiastres: piastres,
  etaMinutes: z.number().int().min(1).max(240).nullable(),
};
const newZoneSchema = z.object({ branchId: id, ...zoneBase }).strict();
const zonePatchSchema = z.object(zoneBase).partial().strict().refine((p) => Object.keys(p).length > 0, "Nothing to update");

const priceBody = z.object({ pricePiastres: piastres }).strict();
const deltaBody = z.object({ priceDeltaPiastres: piastres }).strict();
const availabilityBody = z.object({ isAvailable: z.boolean() }).strict();
const openBody = z.object({ isOpen: z.boolean() }).strict();

/** True only for dates that exist: "2026-02-31" is rejected instead of being rolled over or reaching the database. */
function isRealDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

const dateSchema =z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isRealDate, "Invalid date");
const ordersQuery = z.object({
  date: dateSchema.optional(),
  status: orderStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
const reportQuery = z.object({ date: dateSchema });

function unwrap<T>(result: AdminResult<T>): T {
  if (result.ok) return result.value;
  throw result.reason === "in_use"
    ? new AppError("CONFLICT", "This record is in use and cannot be removed")
    : new AppError("NOT_FOUND", "Not found");
}

export function adminRoutes(deps: AppDeps) {
  const read = requireStaff(deps.auth, "admin:read");
  const write = requireStaff(deps.auth, "admin:write");
  const admin = deps.admin;

  return async (api: FastifyInstance): Promise<void> => {
    const actor = (req: { staff?: { username: string } }) => `staff:${req.staff!.username}`;

    api.get("/admin/items", { preHandler: read }, async () => ({ items: await admin.listItems() }));
    api.post("/admin/items", { preHandler: write }, async (req, reply) =>
      reply.code(201).send({ item: await admin.createItem(actor(req), newItemSchema.parse(req.body)) }),
    );
    api.patch("/admin/items/:id", { preHandler: write }, async (req) => {
      const { id: itemId } = idParamSchema.parse(req.params);
      return { item: unwrap(await admin.updateItem(actor(req), itemId, itemPatchSchema.parse(req.body))) };
    });
    api.put("/admin/sizes/:id/price", { preHandler: write }, async (req, reply) => {
      const { id: sizeId } = idParamSchema.parse(req.params);
      unwrap(await admin.setSizePrice(actor(req), sizeId, priceBody.parse(req.body).pricePiastres));
      return reply.code(204).send();
    });

    api.get("/admin/toppings", { preHandler: read }, async () => ({ toppings: await admin.listToppings() }));
    api.put("/admin/toppings/:id/price", { preHandler: write }, async (req, reply) => {
      const { id: toppingId } = idParamSchema.parse(req.params);
      unwrap(await admin.setToppingPrice(actor(req), toppingId, deltaBody.parse(req.body).priceDeltaPiastres));
      return reply.code(204).send();
    });
    api.put("/admin/toppings/:id/availability", { preHandler: write }, async (req, reply) => {
      const { id: toppingId } = idParamSchema.parse(req.params);
      unwrap(await admin.setToppingAvailability(actor(req), toppingId, availabilityBody.parse(req.body).isAvailable));
      return reply.code(204).send();
    });

    api.get("/admin/crusts", { preHandler: read }, async () => ({ crusts: await admin.listCrusts() }));
    api.put("/admin/crusts/:id/price", { preHandler: write }, async (req, reply) => {
      const { id: crustId } = idParamSchema.parse(req.params);
      unwrap(await admin.setCrustPrice(actor(req), crustId, deltaBody.parse(req.body).priceDeltaPiastres));
      return reply.code(204).send();
    });

    api.get("/admin/zones", { preHandler: read }, async () => ({ zones: await admin.listZones() }));
    api.post("/admin/zones", { preHandler: write }, async (req, reply) =>
      reply.code(201).send({ zone: await admin.createZone(actor(req), newZoneSchema.parse(req.body)) }),
    );
    api.patch("/admin/zones/:id", { preHandler: write }, async (req) => {
      const { id: zoneId } = idParamSchema.parse(req.params);
      return { zone: unwrap(await admin.updateZone(actor(req), zoneId, zonePatchSchema.parse(req.body))) };
    });
    api.delete("/admin/zones/:id", { preHandler: write }, async (req, reply) => {
      const { id: zoneId } = idParamSchema.parse(req.params);
      unwrap(await admin.deleteZone(actor(req), zoneId));
      return reply.code(204).send();
    });

    api.get("/admin/branches", { preHandler: read }, async () => ({ branches: await admin.listBranches() }));
    api.put("/admin/branches/:id/open", { preHandler: write }, async (req, reply) => {
      const { id: branchId } = idParamSchema.parse(req.params);
      unwrap(await admin.setBranchOpen(actor(req), branchId, openBody.parse(req.body).isOpen));
      return reply.code(204).send();
    });

    api.get("/admin/orders", { preHandler: read }, async (req) => {
      const q = ordersQuery.parse(req.query);
      return {
        orders: await admin.listOrders({
          limit: q.limit,
          ...(q.date ? { date: q.date } : {}),
          ...(q.status ? { status: q.status } : {}),
        }),
      };
    });

    api.get("/admin/reports/daily", { preHandler: read }, async (req) => ({
      report: await admin.dailyReport(reportQuery.parse(req.query).date),
    }));
  };
}
