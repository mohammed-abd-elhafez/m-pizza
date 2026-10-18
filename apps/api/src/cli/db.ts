import { fileURLToPath } from "node:url";
import pg from "pg";
import { applyAppRole } from "../infra/app-role";
import { migrate, seedIfEmpty } from "../infra/migrate";

const MIGRATIONS_DIR = fileURLToPath(new URL("../../../../db/migrations", import.meta.url));
const SEED_DIR = fileURLToPath(new URL("../../../../db/seed", import.meta.url));
const APP_ROLE_SQL = fileURLToPath(new URL("../../../../db/ops/app_role.sql", import.meta.url));
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const COMMANDS = ["migrate", "seed", "reset", "app-role"];

/**
 * Database administration. Uses MIGRATION_DATABASE_URL (the owner role) when set, otherwise DATABASE_URL, so the
 * running API can use a restricted role while schema changes keep using owner credentials.
 */
async function main(command: string | undefined): Promise<void> {
  if (!command || !COMMANDS.includes(command)) throw new Error(`Usage: db <${COMMANDS.join("|")}>`);
  const databaseUrl = process.env["MIGRATION_DATABASE_URL"] ?? process.env["DATABASE_URL"];
  if (!databaseUrl) throw new Error("MIGRATION_DATABASE_URL or DATABASE_URL must be set");

  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
  try {
    if (command === "reset") {
      const host = new URL(databaseUrl).hostname;
      if (process.env["NODE_ENV"] === "production" || !LOCAL_HOSTS.has(host)) {
        throw new Error("Refusing to reset: only allowed against a local database outside production");
      }
      await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
      console.log("schema reset");
    }
    if (command === "migrate" || command === "reset" || command === "seed") {
      const applied = await migrate(pool, MIGRATIONS_DIR);
      console.log(applied.length ? `applied: ${applied.join(", ")}` : "migrations up to date");
    }
    if (command === "seed" || command === "reset") {
      console.log((await seedIfEmpty(pool, SEED_DIR)) ? "seeded demo menu" : "seed skipped (data exists)");
    }
    if (command === "app-role") {
      const password = process.env["APP_DB_PASSWORD"];
      if (!password) throw new Error("APP_DB_PASSWORD must be set (read from the environment so it never appears in shell history)");
      await applyAppRole(pool, password, APP_ROLE_SQL);
      console.log("application role mpizza_app is ready; point DATABASE_URL at it and keep MIGRATION_DATABASE_URL for the owner");
    }
  } finally {
    await pool.end();
  }
}

main(process.argv[2]).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
