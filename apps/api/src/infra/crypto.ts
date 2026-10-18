import { createHash, createHmac, randomBytes, randomInt, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";
import type { SecretService } from "../application/auth-ports";

const SCRYPT_PARAMS = { N: 16_384, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;
const MIN_OTP_SECRET_LENGTH = 32;

function derive(password: string, salt: Buffer, opts: ScryptOptions, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, length, opts, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

const sameBytes = (a: Buffer, b: Buffer): boolean => a.length === b.length && timingSafeEqual(a, b);

export class NodeSecretService implements SecretService {
  private dummyHash: Promise<string> | undefined;

  constructor(private readonly otpSecret: string) {
    if (otpSecret.length < MIN_OTP_SECRET_LENGTH) {
      throw new Error(`OTP secret must be at least ${MIN_OTP_SECRET_LENGTH} characters`);
    }
  }

  async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16);
    const { N, r, p } = SCRYPT_PARAMS;
    const key = await derive(password, salt, { N, r, p }, KEY_LENGTH);
    return `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${key.toString("base64")}`;
  }

  async verifyPassword(password: string, stored: string | null): Promise<boolean> {
    // For unknown users we still burn a full scrypt so response time does not reveal whether the account exists.
    const effective = stored ?? (await (this.dummyHash ??= this.hashPassword(randomBytes(16).toString("hex"))));
    const parts = effective.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;
    const [, n, r, p, salt, hash] = parts as [string, string, string, string, string, string];
    const expected = Buffer.from(hash, "base64");
    const actual = await derive(
      password,
      Buffer.from(salt, "base64"),
      { N: Number(n), r: Number(r), p: Number(p) },
      expected.length,
    );
    return stored !== null && sameBytes(actual, expected);
  }

  newSessionToken(): string {
    return randomBytes(32).toString("base64url");
  }

  hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  newOtpCode(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, "0");
  }

  digestOtp(phone: string, code: string): string {
    return createHmac("sha256", this.otpSecret).update(`${phone}:${code}`).digest("hex");
  }

  equalDigests(a: string, b: string): boolean {
    return sameBytes(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  }
}

/** Deterministic digest of any JSON-serialisable value: object keys are sorted so key order never matters. */
export function fingerprint(value: unknown): string {
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canonical)
      : v !== null && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v as Record<string, unknown>)
              .filter(([, x]) => x !== undefined)
              .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
              .map(([k, x]) => [k, canonical(x)]),
          )
        : v;
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
