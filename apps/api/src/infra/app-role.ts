import { readFile } from "node:fs/promises";
import type { Pool } from "pg";

export const APP_ROLE = "mpizza_app";
const MIN_PASSWORD_LENGTH = 24;
const ROLE_NAME = /^[a-z_][a-z0-9_]{0,62}$/;

/**
 * Creates (or refreshes) the least-privilege application role in the pool's database and sets its password.
 * Must be called with owner credentials. Idempotent: grants are reset and re-applied every time.
 * Database roles are cluster-wide, so tests pass their own `role` to avoid touching the real one.
 */
export async function applyAppRole(pool: Pool, password: string, grantsSqlPath: string, role: string = APP_ROLE): Promise<void> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`The application role password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (!ROLE_NAME.test(role)) throw new Error("Invalid role name");
  const db = await pool.connect();
  try {
    await db.query((await readFile(grantsSqlPath, "utf8")).replaceAll("__APP_ROLE__", role));
    // Role passwords cannot be bound as parameters; the driver's literal escaping is used instead.
    await db.query(`ALTER ROLE ${role} WITH PASSWORD ${db.escapeLiteral(password)}`);
  } finally {
    db.release();
  }
}