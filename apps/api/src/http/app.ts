import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { AppError, type ErrorCode } from "../application/errors";
import type { AppDeps } from "./deps";
import { adminRoutes } from "./routes/admin";
import { authRoutes } from "./routes/auth";
import { kitchenRoutes } from "./routes/kitchen";
import { orderRoutes } from "./routes/orders";
import { paymentRoutes } from "./routes/payments";
import { publicRoutes } from "./routes/public";

export type { AppDeps } from "./deps";

const STATUS: Record<ErrorCode, number> = {
  INVALID_REQUEST: 400,
  INVALID_CART: 422,
  OUT_OF_ZONE: 422,
  BELOW_MINIMUM: 422,
  BRANCH_UNAVAILABLE: 422,
  NOT_FOUND: 404,
  ILLEGAL_TRANSITION: 409,
  CONFLICT: 409,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  PAYMENT_PENDING: 409,
  RATE_LIMITED: 429,
};

/** Fixed client messages for framework-level 4xx errors, so library text never reaches callers. */
const FRAMEWORK_MESSAGES: Readonly<Record<number, string>> = {
  400: "Bad request",
  404: "Not found",
  413: "Request body too large",
  415: "Unsupported media type",
  429: "Too many requests",
};

const BODY_LIMIT_BYTES = 32 * 1024;

/** The staff pages load only their own files and talk only to this origin. */
const STAFF_CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; " +
  "base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

/** JSON responses never need to load anything or be framed. */
const API_CSP = "default-src 'none'; frame-ancestors 'none'";

/** Tracking tokens are bearer-like secrets; keep them out of access logs. */
const redactUrl = (url: string): string => url.replace(/(\/orders\/track\/)[^/?]+/, "$1[redacted]");

export function buildApp(deps: AppDeps): FastifyInstance {
  const behindTlsProxy = (deps.trustProxyHops ?? 0) > 0;
  const app = Fastify({
    bodyLimit: BODY_LIMIT_BYTES,
    // Slow-client protections: a request must send its headers and body promptly.
    requestTimeout: 15_000,
    keepAliveTimeout: 5_000,
    http: { headersTimeout: 10_000 },
    trustProxy: behindTlsProxy ? (_address: string, hop: number) => hop < (deps.trustProxyHops ?? 0) : false,
    logger:
      deps.logger === false
        ? false
        : {
            redact: ["req.headers.authorization", "req.headers.cookie"],
            serializers: { req: (req) => ({ method: req.method, url: redactUrl(req.url) }) },
            ...(deps.logStream ? { stream: deps.logStream } : {}),
          },
  });

  void app.register(rateLimit, { global: true, max: 300, timeWindow: "1 minute" });
  void app.register(websocket, { options: { maxPayload: 1024 } });
  void app.register(cors, {
    origin: deps.allowedOrigins && deps.allowedOrigins.length > 0 ? [...deps.allowedOrigins] : false,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["authorization", "content-type", "idempotency-key"],
    maxAge: 600,
  });
  if (deps.staffWebRoot) {
    void app.register(fastifyStatic, { root: deps.staffWebRoot, prefix: "/staff/", wildcard: false, index: ["index.html"] });
  }

  app.addHook("onSend", async (_req, reply) => {
    void reply.header("x-content-type-options", "nosniff");
    void reply.header("referrer-policy", "no-referrer");
    void reply.header("x-frame-options", "DENY");
    void reply.header("cross-origin-opener-policy", "same-origin");
    void reply.header("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()");
    void reply.header("content-security-policy", _req.url.startsWith("/staff") ? STAFF_CSP : API_CSP);
    if (behindTlsProxy) void reply.header("strict-transport-security", "max-age=31536000; includeSubDomains");
    if (!reply.hasHeader("cache-control")) void reply.header("cache-control", "no-store");
  });

  app.setNotFoundHandler((_req, reply) =>
    reply.code(404).send({ error: { code: "NOT_FOUND", message: "Not found" } }),
  );

  /** Authentication/authorisation failures and throttling are security events; record them without secrets. */
  const logSecurityEvent = (req: FastifyRequest, status: number, code: string): void => {
    if (status !== 401 && status !== 403 && status !== 429) return;
    req.log.warn({ event: "security", status, code, method: req.method, route: req.routeOptions?.url ?? "unmatched", ip: req.ip }, "access denied");
  };

  app.setErrorHandler((err: Error & { statusCode?: number }, req, reply) => {
    // Error responses are never cacheable, whatever a route set before it failed.
    void reply.header("cache-control", "no-store");
    if (err instanceof ZodError) {
      return reply.code(400).send({
        error: { code: "INVALID_REQUEST", message: "Invalid request", fields: err.issues.map((i) => i.path.join(".")) },
      });
    }
    if (err instanceof AppError) {
      logSecurityEvent(req, STATUS[err.code], err.code);
      return reply.code(STATUS[err.code]).send({ error: { code: err.code, message: err.message } });
    }
    const status = err.statusCode;
    if (status && status >= 400 && status < 500) {
      logSecurityEvent(req, status, "BAD_REQUEST");
      return reply.code(status).send({ error: { code: "BAD_REQUEST", message: FRAMEWORK_MESSAGES[status] ?? "Bad request" } });
    }
    req.log.error({ err }, "unhandled error");
    return reply.code(500).send({ error: { code: "INTERNAL", message: "Internal error" } });
  });

  // Routes live in child plugins registered after rate-limit/websocket so those plugins see every route.
  void app.register(publicRoutes(deps));
  void app.register(authRoutes(deps));
  void app.register(orderRoutes(deps));
  void app.register(kitchenRoutes(deps));
  void app.register(adminRoutes(deps));
  void app.register(paymentRoutes(deps));

  return app;
}
