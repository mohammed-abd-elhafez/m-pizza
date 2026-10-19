import type { FastifyInstance, FastifyRequest } from "fastify";
import { AppError } from "../../application/errors";
import { placeOrder } from "../../application/place-order";
import { startCheckout } from "../../application/payments";
import type { OrderView, PlacedOrder } from "../../application/ports";
import { requireCustomer } from "../auth-hooks";
import type { AppDeps } from "../deps";
import { idempotencyKeySchema, placeOrderSchema, trackingTokenSchema } from "../schemas";

const HISTORY_LIMIT = 20;
const MAX_STREAMS_PER_TOKEN = 5;
const HEARTBEAT_MS = 30_000;
/** A checkout page stays valid about an hour; do not open a second one while the first is recent. */
const CHECKOUT_REUSE_MS = 10 * 60 * 1000;
const WS_TRY_AGAIN_LATER = 1013;

/** WebSocket upgrades do not use normal CORS checks, so validate the browser Origin explicitly. */
function websocketOriginAllowed(req: FastifyRequest, allowedOrigins?: readonly string[]): boolean {
  const origin = req.headers.origin;
  if (typeof origin !== "string" || origin.length === 0) return true;
  const sameOrigin = origin === `${req.protocol}://${req.headers.host}`;
  if (sameOrigin) return true;
  return allowedOrigins?.includes(origin) ?? false;
}

/** Customer-facing shape: the internal sequential id is never exposed. */
const publicOrder = <T extends PlacedOrder | OrderView>({ id: _id, ...rest }: T): Omit<T, "id"> => rest;

export function orderRoutes(deps: AppDeps) {
  const customerOnly = requireCustomer(deps.auth);
  const ordersPerMinute = deps.ordersPerMinute ?? 10;
  const streams = new Map<string, number>();

  return async (api: FastifyInstance): Promise<void> => {
    api.post(
      "/orders",
      { preHandler: customerOnly, config: { rateLimit: { max: ordersPerMinute, timeWindow: "1 minute" } } },
      async (req, reply) => {
        const customer = req.customer!;
        const idempotencyKey = idempotencyKeySchema.parse(req.headers["idempotency-key"]);
        const body = placeOrderSchema.parse(req.body);
        if (body.paymentMethod === "online" && !deps.payments) {
          throw new AppError("INVALID_REQUEST", "Online payment is not available");
        }

        const { order, replayed } = await placeOrder(
          {
            catalog: deps.catalog,
            orders: deps.orders,
            newToken: deps.newToken,
            fingerprint: deps.fingerprint,
            now: deps.now,
          },
          { ...body, phone: customer.phone, idempotencyKey },
        );

        let payment: { redirectUrl: string } | null = null;
        if (body.paymentMethod === "online" && deps.payments && !replayed) {
          try {
            const checkout = await startCheckout(deps.payments, { ...order, phone: customer.phone }, "1");
            payment = { redirectUrl: checkout.redirectUrl };
          } catch (err) {
            // The order exists unpaid; the client can retry through POST /orders/track/:token/checkout.
            req.log.error({ err }, "could not open checkout");
          }
        }
        return reply.code(replayed ? 200 : 201).send({ order: publicOrder(order), payment });
      },
    );

    api.get("/orders", { preHandler: customerOnly }, async (req) => ({
      orders: await deps.orders.listForCustomer(req.customer!.customerId, HISTORY_LIMIT),
    }));

    api.get("/orders/track/:token", async (req) => {
      const { token } = req.params as { token: string };
      const order = await deps.orders.findByToken(trackingTokenSchema.parse(token));
      if (!order) throw new AppError("NOT_FOUND", "Order not found");
      return { order: publicOrder(order) };
    });

    api.post(
      "/orders/track/:token/checkout",
      { preHandler: customerOnly, config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
      async (req) => {
      if (!deps.payments) throw new AppError("INVALID_REQUEST", "Online payment is not available");
      const { token } = req.params as { token: string };
      // Only the customer who placed the order may open a payment for it.
      const order = await deps.orders.findByTokenForCustomer(trackingTokenSchema.parse(token), req.customer!.customerId);
      if (!order) throw new AppError("NOT_FOUND", "Order not found");
      if (order.paymentStatus !== "UNPAID" || order.status === "CANCELLED") {
        throw new AppError("CONFLICT", "This order does not need payment");
      }
      // One open checkout at a time: two live payment pages for the same order could both be paid.
      if (await deps.payments.repo.hasRecentPending(order.id, new Date(deps.now().getTime() - CHECKOUT_REUSE_MS))) {
        throw new AppError("CONFLICT", "A payment page is already open for this order; finish it or wait a few minutes");
      }
      const checkout = await startCheckout(deps.payments, { ...order, phone: req.customer!.phone }, deps.newToken().slice(0, 8));
      return { payment: { redirectUrl: checkout.redirectUrl } };
      },
    );

    // Live status for the tracking screen. The token is checked before the connection is upgraded.
    api.get(
      "/orders/track/:token/stream",
      {
        websocket: true,
        preValidation: async (req) => {
          if (!websocketOriginAllowed(req, deps.allowedOrigins)) {
            throw new AppError("FORBIDDEN", "WebSocket origin is not allowed");
          }
          const { token } = req.params as { token: string };
          const parsed = trackingTokenSchema.safeParse(token);
          if (!parsed.success || !(await deps.orders.findByToken(parsed.data))) {
            throw new AppError("NOT_FOUND", "Order not found");
          }
        },
      },
      async (socket, req) => {
        const { token } = req.params as { token: string };

        // Everything up to the first await is synchronous, so the cap cannot be raced and a client that
        // disconnects while we load the current status can never leave a slot or a listener behind.
        if ((streams.get(token) ?? 0) >= MAX_STREAMS_PER_TOKEN) {
          socket.close(WS_TRY_AGAIN_LATER, "too many streams");
          return;
        }
        streams.set(token, (streams.get(token) ?? 0) + 1);

        const send = (status: string, paymentStatus: string): void => {
          if (socket.readyState === socket.OPEN) socket.send(JSON.stringify({ type: "status", status, paymentStatus }));
        };
        const unsubscribe = deps.events.subscribe(token, (event) => send(event.status, event.paymentStatus));
        const heartbeat = setInterval(() => {
          if (socket.readyState === socket.OPEN) socket.ping();
        }, HEARTBEAT_MS);
        socket.on("close", () => {
          clearInterval(heartbeat);
          unsubscribe();
          const left = (streams.get(token) ?? 1) - 1;
          if (left <= 0) streams.delete(token);
          else streams.set(token, left);
        });

        const current = await deps.orders.findByToken(token);
        if (current) send(current.status, current.paymentStatus);
      },
    );
  };
}
