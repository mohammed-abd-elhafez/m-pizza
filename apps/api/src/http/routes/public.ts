import type { FastifyInstance } from "fastify";
import { priceCart } from "../../application/price-cart";
import type { AppDeps } from "../deps";
import { priceCartSchema } from "../schemas";

const CART_PRICE_PER_MINUTE = 60;

export function publicRoutes(deps: AppDeps) {
  return async (api: FastifyInstance): Promise<void> => {
    api.get("/health", async () => ({ status: "ok" }));

    api.get("/menu", async (_req, reply) => {
      const menu = await deps.catalog.loadMenu();
      // Only a successful response may be cached; setting this before the query would let errors inherit it.
      void reply.header("cache-control", "public, max-age=60");
      return menu;
    });

    api.post(
      "/cart/price",
      { config: { rateLimit: { max: CART_PRICE_PER_MINUTE, timeWindow: "1 minute" } } },
      async (req) => {
        const { fulfilment, priced } = await priceCart(deps.catalog, priceCartSchema.parse(req.body));
        return {
          subtotalPiastres: priced.subtotal,
          deliveryFeePiastres: priced.deliveryFee,
          totalPiastres: priced.total,
          minOrderPiastres: fulfilment.minOrderPiastres,
          etaMinutes: fulfilment.etaMinutes,
          lines: priced.lines.map((l) => ({ unitPiastres: l.unit, totalPiastres: l.total })),
        };
      },
    );
  };
}
