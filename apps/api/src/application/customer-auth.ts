import { AppError } from "./errors";
import type { AuthDeps, IssuedSession } from "./auth-ports";
import { CUSTOMER_SESSION_MS, issueSession } from "./sessions";

export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_REQUEST_WINDOW_MS = 10 * 60 * 1000;
export const OTP_MAX_REQUESTS_PER_WINDOW = 3;
/** Wrong guesses allowed per phone per day across all of its codes; beyond this the phone is locked until the window passes. */
export const OTP_MAX_FAILED_PER_DAY = 10;
export const OTP_LOCK_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Sends a one-time code. Always resolves the same way (even when throttled) so callers cannot probe
 * which numbers are registered or how many codes were requested.
 */
export async function requestOtp(deps: AuthDeps, phone: string): Promise<void> {
  const now = deps.now();
  const code = deps.secrets.newOtpCode();
  const stored = await deps.otps.createIfUnderLimit(
    { phone, codeDigest: deps.secrets.digestOtp(phone, code), expiresAt: new Date(now.getTime() + OTP_TTL_MS) },
    new Date(now.getTime() - OTP_REQUEST_WINDOW_MS),
    OTP_MAX_REQUESTS_PER_WINDOW,
  );
  if (stored) await deps.sender.send(phone, code);
}

export async function verifyOtp(
  deps: AuthDeps,
  phone: string,
  code: string,
): Promise<IssuedSession & { readonly customerId: number }> {
  const invalid = () => new AppError("UNAUTHORIZED", "Invalid or expired code");
  const now = deps.now();

  // Requesting fresh codes must not reset the guess budget.
  const failedToday = await deps.otps.failedAttemptsSince(phone, new Date(now.getTime() - OTP_LOCK_WINDOW_MS));
  if (failedToday >= OTP_MAX_FAILED_PER_DAY) throw invalid();

  const active = await deps.otps.findActive(phone, now);
  if (!active) throw invalid();
  // Spend the guess before comparing so concurrent guesses can never exceed the attempt limit.
  if (!(await deps.otps.claimAttempt(active.id, OTP_MAX_ATTEMPTS))) throw invalid();
  if (!deps.secrets.equalDigests(active.codeDigest, deps.secrets.digestOtp(phone, code))) throw invalid();
  if (!(await deps.otps.consume(active.id, now))) throw invalid();

  const customer = await deps.customers.upsertByPhone(phone);
  const session = await issueSession(deps, "customer", customer.id, CUSTOMER_SESSION_MS);
  return { ...session, customerId: customer.id };
}
