import { z } from "zod";
import { normalizeEgyptPhone } from "../domain/phone";
import { cleanText } from "../domain/text";

const PG_INT_MAX = 2_147_483_647;
/** Free text: cleaned of invisible/bidi characters first, then trimmed and length-checked. The raw cap bounds work done before cleaning. */
export const freeText = ({ min = 0, max }: { min?: number; max: number }) =>
  z
    .string()
    .max(max * 4)
    .transform(cleanText)
    .pipe(z.string().trim().min(min).max(max));

const id = z.number().int().positive().max(PG_INT_MAX);

const topping = z.object({ id, action: z.enum(["add", "remove"]) }).strict();

const half = z
  .object({
    half: z.enum(["whole", "left", "right"]),
    itemId: id,
    sizeId: id,
    toppings: z.array(topping).max(20).default([]),
  })
  .strict();

const line = z
  .object({
    halves: z.array(half).min(1).max(2),
    crustId: id.optional(),
    qty: z.number().int().min(1).max(50),
    note: freeText({ max: 200 }).optional(),
  })
  .strict();

const point = z
  .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
  .strict();

const fulfilment = {
  service: z.enum(["delivery", "pickup"]),
  branchId: id.optional(),
  location: point.optional(),
  lines: z.array(line).min(1).max(30),
};

const shortText = freeText({ max: 60 });

const egyptPhone = z
  .string()
  .max(32)
  .refine((s) => normalizeEgyptPhone(s) !== null, "Invalid Egyptian mobile number")
  .transform((s) => normalizeEgyptPhone(s) as string);

export const priceCartSchema = z.object(fulfilment).strict();

export const placeOrderSchema = z
  .object({
    ...fulfilment,
    address: z
      .object({
        landmark: freeText({ min: 3, max: 200 }),
        building: shortText.optional(),
        floor: shortText.optional(),
        apartment: shortText.optional(),
        notes: freeText({ max: 200 }).optional(),
      })
      .strict()
      .optional(),
    paymentMethod: z.enum(["cod", "online"]),
    note: freeText({ max: 300 }).optional(),
  })
  .strict();

export const otpRequestSchema = z.object({ phone: egyptPhone }).strict();
export const otpVerifySchema = z.object({ phone: egyptPhone, code: z.string().regex(/^\d{6}$/) }).strict();
export const staffLoginSchema = z
  .object({ username: z.string().trim().min(3).max(64), password: z.string().min(12).max(200) })
  .strict();

export const idempotencyKeySchema = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/, "Invalid Idempotency-Key");

export const trackingTokenSchema = z.string().min(8).max(64).regex(/^[A-Za-z0-9-]+$/);

export const orderStatusSchema = z.enum([
  "PLACED",
  "ACCEPTED",
  "PREPARING",
  "READY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "PICKED_UP",
  "CANCELLED",
]);

export const transitionSchema = z
  .object({ to: orderStatusSchema, reason: freeText({ max: 200 }).optional() })
  .strict();

export const idParamSchema = z.object({ id: z.coerce.number().int().positive().max(PG_INT_MAX) });

export const KITCHEN_MAX_LIMIT = 200;

export const kitchenQuerySchema = z.object({
  status: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(",") : ["PLACED", "ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY"]))
    .pipe(z.array(orderStatusSchema).min(1).max(8)),
  branchId: z.coerce.number().int().positive().max(PG_INT_MAX).optional(),
  limit: z.coerce.number().int().min(1).max(KITCHEN_MAX_LIMIT).default(100),
});
