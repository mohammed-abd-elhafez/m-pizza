import type { FastifyInstance } from "fastify";
import { AppError } from "../../application/errors";
import { handlePaymentWebhook } from "../../application/payments";
import type { AppDeps } from "../deps";

/**
 * Provider webhook. Authenticated by the provider's signature, not by a session. Lives in its own encapsulated
 * scope because it needs the raw body (the signature covers exact bytes), unlike every other route.
 */
export function paymentRoutes(deps: AppDeps) {
  return async (api: FastifyInstance): Promise<void> => {
    api.removeContentTypeParser("application/json");
    api.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => done(null, body));

    api.post(
      "/payments/webhook/:provider",
      { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
      async (req, reply) => {
        const { provider } = req.params as { provider: string };
        if (!deps.payments || deps.payments.gateway.provider !== provider || typeof req.body !== "string") {
          throw new AppError("NOT_FOUND", "Not found");
        }
        const query = Object.fromEntries(
          Object.entries(req.query as Record<string, unknown>).filter(([, v]) => typeof v === "string"),
        ) as Record<string, string>;

        const result = await handlePaymentWebhook(
          { gateway: deps.payments.gateway, repo: deps.payments.repo, events: deps.events },
          { rawBody: req.body, query },
        );
        return reply.code(200).send(result);
      },
    );
  };
}
