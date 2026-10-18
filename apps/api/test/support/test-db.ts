import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { migrate, seedIfEmpty } from "../../src/infra/migrate";

export const MIGRATIONS_DIR = resolve(__dirname, "../../../../db/migrations");
export const SEED_DIR = resolve(__dirname, "../../../../db/seed");
export const APP_ROLE_SQL = resolve(__dirname, "../../../../db/ops/app_role.sql");

/** Owner credentials: tests create and drop databases, so they need MIGRATION_DATABASE_URL when the API uses a restricted role. */
function adminUrl(): string | null {
  const fromEnv = process.env["MIGRATION_DATABASE_URL"] ?? process.env["DATABASE_URL"];
  if (fromEnv) return fromEnv;
  const envFile = resolve(__dirname, "../../.env.local");
  if (!existsSync(envFile)) return null;
  const lines = readFileSync(envFile, "utf8").split(/\r?\n/);
  const pick = (name: string) => lines.find((l) => l.startsWith(`${name}=`))?.slice(name.length + 1).trim() ?? null;
  return pick("MIGRATION_DATABASE_URL") ?? pick("DATABASE_URL");
}

/** Connection string for a database on the configured server, optionally as a different role. */
export function urlFor(dbName: string, user?: string, password?: string): string | null {
  const base = adminUrl();
  if (!base) return null;
  const url = new URL(base);
  url.pathname = `/${dbName}`;
  if (user) url.username = user;
  if (password) url.password = password;
  return url.toString();
}

/**
 * Creates a fresh, migrated and seeded database named `dbName` (default `mpizza_test`) and returns an owner pool.
 * Returns null when no Postgres is configured. Different test files use different names so they can run in parallel.
 */
export async function createTestPool(dbName = "mpizza_test"): Promise<pg.Pool | null> {
  const base = adminUrl();
  const target = urlFor(dbName);
  if (!base || !target) return null;

  const admin = new pg.Client({ connectionString: base });
  try {
    await admin.connect();
  } catch {
    return null;
  }
  await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${dbName}`);
  await admin.end();

  const pool = new pg.Pool({ connectionString: target, max: 8 });
  await migrate(pool, MIGRATIONS_DIR);
  await seedIfEmpty(pool, SEED_DIR);
  return pool;
}
