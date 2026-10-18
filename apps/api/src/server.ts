import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { expireUnpaidOrders } from "./application/expire-orders";
import { loadServerConfig } from "./config";
import { buildApp } from "./http/app";
import { NodeSecretService, fingerprint } from "./infra/crypto";
import { InMemoryOrderEvents } from "./infra/event-bus";
import { ConsoleOtpSender } from "./infra/otp-senders";
import { PgAdminRepo } from "./infra/pg-admin";
import { PgCustomerRepo, PgOtpRepo, PgSessionRepo, PgStaffRepo } from "./infra/pg-auth";
import { PgCatalogRepo } from "./infra/pg-catalog";
import { PgOrderRepo } from "./infra/pg-orders";
import { PgPaymentRepo } from "./infra/pg-payments";
import { PaymobGateway } from "./infra/paymob";

async function main(): Promise<void> {
  const config = loadServerConfig();
  if (config.production) {
    // No SMS provider is wired yet; refuse to run in production rather than log one-time codes.
    throw new Error("No SMS provider is configured; customer login cannot run in production yet");
  }
  const pool = new pg.Pool({
    connectionString: config.databaseUrl,
    max: 10,
    connectionTimeoutMillis: 5_000,
    // A runaway query or a transaction left open by a crashed request must not hold connections or locks forever.
    statement_timeout: 10_000,
    idle_in_transaction_session_timeout: 15_000,
    application_name: "mpizza-api",
  });
  // An error on an idle pooled connection (database restart, network drop) is emitted here; unhandled, it kills the process.
  pool.on("error", (err) => console.error("idle database connection error:", err.message));
  const events = new InMemoryOrderEvents();
  const orders = new PgOrderRepo(pool);

  const app = buildApp({
    catalog: new PgCatalogRepo(pool),
    orders,
    events,
    admin: new PgAdminRepo(pool),
    auth: {
      secrets: new NodeSecretService(config.otpSecret),
      otps: new PgOtpRepo(pool),
      sessions: new PgSessionRepo(pool),
      customers: new PgCustomerRepo(pool),
      staff: new PgStaffRepo(pool),
      sender: new ConsoleOtpSender(),
      now: () => new Date(),
    },
    ...(config.paymob ? { payments: { gateway: new PaymobGateway(config.paymob), repo: new PgPaymentRepo(pool) } } : {}),
    newToken: randomUUID,
    fingerprint,
    now: () => new Date(),
    trustProxyHops: config.trustProxyHops,
    allowedOrigins: config.allowedOrigins,
    staffWebRoot: fileURLToPath(new URL("../../staff-web/public", import.meta.url)),
  });

  const sweep = setInterval(() => {
    expireUnpaidOrders({ orders, events }, new Date()).catch((err: unknown) => {
      app.log.error({ err }, "expiring unpaid orders failed");
    });
  }, 5 * 60 * 1000);
  sweep.unref();

  const shutdown = async (code = 0): Promise<void> => {
    // Never hang on shutdown: whatever is still open after 10 s is abandoned.
    setTimeout(() => process.exit(code || 1), 10_000).unref();
    clearInterval(sweep);
    await app.close();
    await pool.end();
    process.exit(code);
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
  // Unknown failures leave the process in an unknown state: log and exit so the supervisor restarts it cleanly.
  process.on("unhandledRejection", (reason) => {
    app.log.fatal({ err: reason }, "unhandled rejection");
    void shutdown(1);
  });
  process.on("uncaughtException", (err) => {
    app.log.fatal({ err }, "uncaught exception");
    void shutdown(1);
  });

  await app.listen({ port: config.port, host: config.host });
}

main().catch((err: unknown) => {
  console.error("Failed to start:", err instanceof Error ? err.message : err);
  process.exit(1);
});
