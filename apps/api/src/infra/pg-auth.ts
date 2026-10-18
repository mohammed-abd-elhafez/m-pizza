import type { Pool } from "pg";
import type {
  Customer,
  CustomerRepository,
  OtpRepository,
  SessionRepository,
  StaffAccount,
  StaffRepository,
  SubjectType,
} from "../application/auth-ports";
import type { StaffRole } from "../domain/policy";

export class PgOtpRepo implements OtpRepository {
  constructor(private readonly pool: Pool) {}

  async createIfUnderLimit(
    otp: { phone: string; codeDigest: string; expiresAt: Date },
    since: Date,
    max: number,
  ): Promise<boolean> {
    const db = await this.pool.connect();
    try {
      await db.query("BEGIN");
      // Serialise per phone so parallel requests cannot all pass the count before any of them inserts.
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 1))", [`otp:${otp.phone}`]);
      const { rows } = await db.query<{ n: string }>(
        "SELECT count(*) AS n FROM otp_requests WHERE phone = $1 AND created_at >= $2",
        [otp.phone, since],
      );
      if (Number(rows[0]?.n ?? 0) >= max) {
        await db.query("COMMIT");
        return false;
      }
      await db.query("INSERT INTO otp_requests (phone, code_digest, expires_at) VALUES ($1, $2, $3)", [
        otp.phone,
        otp.codeDigest,
        otp.expiresAt,
      ]);
      await db.query("COMMIT");
      return true;
    } catch (err) {
      await db.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      db.release();
    }
  }

  async failedAttemptsSince(phone: string, since: Date): Promise<number> {
    const { rows } = await this.pool.query<{ n: string }>(
      "SELECT COALESCE(sum(attempts), 0) AS n FROM otp_requests WHERE phone = $1 AND created_at >= $2 AND consumed_at IS NULL",
      [phone, since],
    );
    return Number(rows[0]?.n ?? 0);
  }

  async findActive(phone: string, now: Date): Promise<{ id: number; codeDigest: string } | null> {
    const { rows } = await this.pool.query<{ id: string; code_digest: string }>(
      `SELECT id, code_digest FROM otp_requests
        WHERE phone = $1 AND consumed_at IS NULL AND expires_at > $2
        ORDER BY created_at DESC, id DESC LIMIT 1`,
      [phone, now],
    );
    const row = rows[0];
    return row ? { id: Number(row.id), codeDigest: row.code_digest } : null;
  }

  async claimAttempt(id: number, max: number): Promise<boolean> {
    const res = await this.pool.query(
      "UPDATE otp_requests SET attempts = attempts + 1 WHERE id = $1 AND attempts < $2 AND consumed_at IS NULL",
      [id, max],
    );
    return res.rowCount === 1;
  }

  async consume(id: number, now: Date): Promise<boolean> {
    const res = await this.pool.query(
      "UPDATE otp_requests SET consumed_at = $2 WHERE id = $1 AND consumed_at IS NULL",
      [id, now],
    );
    return res.rowCount === 1;
  }
}

export class PgSessionRepo implements SessionRepository {
  constructor(private readonly pool: Pool) {}

  async create(s: { tokenHash: string; subjectType: SubjectType; subjectId: number; expiresAt: Date }): Promise<void> {
    await this.pool.query(
      "INSERT INTO sessions (token_hash, subject_type, subject_id, expires_at) VALUES ($1, $2, $3, $4)",
      [s.tokenHash, s.subjectType, s.subjectId, s.expiresAt],
    );
  }

  async find(tokenHash: string, now: Date): Promise<{ subjectType: SubjectType; subjectId: number } | null> {
    const { rows } = await this.pool.query<{ subject_type: SubjectType; subject_id: number }>(
      "SELECT subject_type, subject_id FROM sessions WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > $2",
      [tokenHash, now],
    );
    const row = rows[0];
    return row ? { subjectType: row.subject_type, subjectId: row.subject_id } : null;
  }

  async revoke(tokenHash: string): Promise<void> {
    await this.pool.query("UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL", [
      tokenHash,
    ]);
  }
}

export class PgCustomerRepo implements CustomerRepository {
  constructor(private readonly pool: Pool) {}

  async upsertByPhone(phone: string): Promise<Customer> {
    const { rows } = await this.pool.query<Customer>(
      "INSERT INTO customers (phone) VALUES ($1) ON CONFLICT (phone) DO UPDATE SET phone = EXCLUDED.phone RETURNING id, phone",
      [phone],
    );
    return rows[0]!;
  }

  async findById(id: number): Promise<Customer | null> {
    const { rows } = await this.pool.query<Customer>("SELECT id, phone FROM customers WHERE id = $1", [id]);
    return rows[0] ?? null;
  }
}

interface StaffRow {
  id: number;
  username: string;
  password_hash: string;
  role: StaffRole;
  branch_id: number | null;
  is_active: boolean;
}

const toStaff = (r: StaffRow): StaffAccount => ({
  id: r.id,
  username: r.username,
  passwordHash: r.password_hash,
  role: r.role,
  branchId: r.branch_id,
  isActive: r.is_active,
});

export class PgStaffRepo implements StaffRepository {
  constructor(private readonly pool: Pool) {}

  async findByUsername(username: string): Promise<StaffAccount | null> {
    const { rows } = await this.pool.query<StaffRow>(
      "SELECT id, username, password_hash, role, branch_id, is_active FROM staff_users WHERE username = $1",
      [username],
    );
    return rows[0] ? toStaff(rows[0]) : null;
  }

  async recordLoginFailure(username: string, at: Date): Promise<void> {
    await this.pool.query("INSERT INTO staff_login_failures (username, created_at) VALUES ($1, $2)", [username, at]);
  }

  async countLoginFailures(username: string, since: Date): Promise<number> {
    const { rows } = await this.pool.query<{ n: string }>(
      "SELECT count(*) AS n FROM staff_login_failures WHERE username = $1 AND created_at >= $2",
      [username, since],
    );
    return Number(rows[0]?.n ?? 0);
  }

  async findById(id: number): Promise<StaffAccount | null> {
    const { rows } = await this.pool.query<StaffRow>(
      "SELECT id, username, password_hash, role, branch_id, is_active FROM staff_users WHERE id = $1",
      [id],
    );
    return rows[0] ? toStaff(rows[0]) : null;
  }
}
