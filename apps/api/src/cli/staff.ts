import pg from "pg";
import { loadServerConfig } from "../config";
import { NodeSecretService } from "../infra/crypto";

const USERNAME = /^[a-z0-9._-]{3,64}$/;
const MIN_PASSWORD_LENGTH = 12;

/**
 * Creates or updates a staff account. The password is read from STAFF_PASSWORD so it never appears in shell
 * history or process listings:  STAFF_PASSWORD=... npm run staff:upsert -- <username> <kitchen|admin> [branchId]
 */
async function main(): Promise<void> {
  const [username, role, branch] = process.argv.slice(2);
  const password = process.env["STAFF_PASSWORD"];
  if (!username || !USERNAME.test(username)) throw new Error("username must match [a-z0-9._-]{3,64}");
  if (role !== "kitchen" && role !== "admin") throw new Error("role must be kitchen or admin");
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`STAFF_PASSWORD must be set to at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  const branchId = branch === undefined ? null : Number(branch);
  if (role === "admin" && branchId !== null) throw new Error("admin accounts are global; do not pass a branchId");
  if (branchId !== null && (!Number.isInteger(branchId) || branchId < 1)) throw new Error("branchId must be a positive integer");

  const config = loadServerConfig();
  const hash = await new NodeSecretService(config.otpSecret).hashPassword(password);
  // Staff accounts are managed with owner credentials; the running API role can only read them.
  const pool = new pg.Pool({ connectionString: process.env["MIGRATION_DATABASE_URL"] ?? config.databaseUrl, max: 1 });
  try {
    await pool.query(
      `INSERT INTO staff_users (username, password_hash, role, branch_id, is_active)
       VALUES ($1, $2, $3, $4, TRUE)
       ON CONFLICT (username) DO UPDATE
         SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, branch_id = EXCLUDED.branch_id, is_active = TRUE`,
      [username, hash, role, branchId],
    );
    await pool.query("UPDATE sessions SET revoked_at = now() WHERE subject_type = 'staff' AND revoked_at IS NULL AND subject_id = (SELECT id FROM staff_users WHERE username = $1)", [username]);
    console.log(`staff account "${username}" saved (${role}${branchId ? `, branch ${branchId}` : ""}); existing sessions revoked`);
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
