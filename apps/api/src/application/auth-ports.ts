import type { StaffRole } from "../domain/policy";

export interface SecretService {
  hashPassword(password: string): Promise<string>;
  /** Pass `null` when the user does not exist: equivalent work is done so timing does not reveal it. */
  verifyPassword(password: string, stored: string | null): Promise<boolean>;
  newSessionToken(): string;
  hashToken(token: string): string;
  newOtpCode(): string;
  digestOtp(phone: string, code: string): string;
  equalDigests(a: string, b: string): boolean;
}

export interface OtpRepository {
  /** Atomically stores a new challenge unless `max` were already created since `since` for this phone (no race). */
  createIfUnderLimit(otp: { phone: string; codeDigest: string; expiresAt: Date }, since: Date, max: number): Promise<boolean>;
  /** Wrong guesses on unused challenges since `since`; locks a phone out however many codes it requests. */
  failedAttemptsSince(phone: string, since: Date): Promise<number>;
  findActive(phone: string, now: Date): Promise<{ id: number; codeDigest: string } | null>;
  /** Atomically spends one guess; false when the challenge is out of attempts, so guesses can never exceed `max`. */
  claimAttempt(id: number, max: number): Promise<boolean>;
  /** One-time use: true only for the first caller. */
  consume(id: number, now: Date): Promise<boolean>;
}

export type SubjectType = "customer" | "staff";

export interface SessionRepository {
  create(session: { tokenHash: string; subjectType: SubjectType; subjectId: number; expiresAt: Date }): Promise<void>;
  find(tokenHash: string, now: Date): Promise<{ subjectType: SubjectType; subjectId: number } | null>;
  revoke(tokenHash: string): Promise<void>;
}

export interface Customer {
  readonly id: number;
  readonly phone: string;
}

export interface CustomerRepository {
  upsertByPhone(phone: string): Promise<Customer>;
  findById(id: number): Promise<Customer | null>;
}

export interface StaffAccount {
  readonly id: number;
  readonly username: string;
  readonly passwordHash: string;
  readonly role: StaffRole;
  readonly branchId: number | null;
  readonly isActive: boolean;
}

export interface StaffRepository {
  findByUsername(username: string): Promise<StaffAccount | null>;
  recordLoginFailure(username: string, at: Date): Promise<void>;
  countLoginFailures(username: string, since: Date): Promise<number>;
  findById(id: number): Promise<StaffAccount | null>;
}

export interface OtpSender {
  send(phone: string, code: string): Promise<void>;
}

export interface AuthDeps {
  readonly secrets: SecretService;
  readonly otps: OtpRepository;
  readonly sessions: SessionRepository;
  readonly customers: CustomerRepository;
  readonly staff: StaffRepository;
  readonly sender: OtpSender;
  readonly now: () => Date;
}

export interface CustomerPrincipal {
  readonly customerId: number;
  readonly phone: string;
}

export interface StaffPrincipal {
  readonly staffId: number;
  readonly username: string;
  readonly role: StaffRole;
  readonly branchId: number | null;
}

export interface IssuedSession {
  readonly token: string;
  readonly expiresAt: Date;
}
