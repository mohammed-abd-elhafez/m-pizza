import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Pool } from "pg";

const MIGRATION_LOCK_KEY = 727_001;

const sqlFiles = async (dir: string): Promise<string[]> =>
  (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

/**
 * Applies pending `*.sql` files from `dir` in name order. Each file and its bookkeeping row commit together,
 * and an advisory lock stops two runners from applying the same file. Files must not contain BEGIN/COMMIT.
 */
export async function migrate(pool: Pool, dir: string): Promise<string[]> {
  const db = await pool.connect();
  const applied: string[] = [];
  try {
    await db.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
    await db.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
    );
    const done = new Set((await db.query<{ name: string }>("SELECT name FROM schema_migrations")).rows.map((r) => r.name));

    for (const file of await sqlFiles(dir)) {
      if (done.has(file)) continue;
      const sql = await readFile(join(dir, file), "utf8");
      try {
        await db.query("BEGIN");
        await db.query(sql);
        await db.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        await db.query("COMMIT");
      } catch (err) {
        await db.query("ROLLBACK").catch(() => undefined);
        throw new Error(`Migration ${file} failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      applied.push(file);
    }
    return applied;
  } finally {
    await db.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]).catch(() => undefined);
    db.release();
  }
}

/** Loads demo seed files, but only into a database that has no categories yet. */
export async function seedIfEmpty(pool: Pool, dir: string): Promise<boolean> {
  const { rows } = await pool.query<{ n: string }>("SELECT count(*) AS n FROM categories");
  if (Number(rows[0]?.n) > 0) return false;
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    for (const file of await sqlFiles(dir)) await db.query(await readFile(join(dir, file), "utf8"));
    await db.query("COMMIT");
    return true;
  } catch (err) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    db.release();
  }
}
