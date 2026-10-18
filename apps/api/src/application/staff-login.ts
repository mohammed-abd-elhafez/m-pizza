import { AppError } from "./errors";
import type { AuthDeps, IssuedSession } from "./auth-ports";
import type { StaffRole } from "../domain/policy";
import { STAFF_SESSION_MS, issueSession } from "./sessions";

export const STAFF_MAX_FAILURES = 10;
export const STAFF_FAILURE_WINDOW_MS = 15 * 60 * 1000;

export async function staffLogin(
  deps: AuthDeps,
  username: string,
  password: string,
): Promise<IssuedSession & { readonly role: StaffRole }> {
  const denied = () => new AppError("UNAUTHORIZED", "Invalid credentials");
  const now = deps.now();

  // Per-account throttle: guessing one account from many IPs still stops after a few attempts.
  // A locked account answers exactly like a wrong password and does the same amount of work.
  const failures = await deps.staff.countLoginFailures(username, new Date(now.getTime() - STAFF_FAILURE_WINDOW_MS));
  const locked = failures >= STAFF_MAX_FAILURES;

  const account = await deps.staff.findByUsername(username);
  const passwordOk = await deps.secrets.verifyPassword(password, account?.passwordHash ?? null);

  if (locked || !account || !account.isActive || !passwordOk) {
    // Attempts made while locked are not counted, so the lock ends on its own instead of being extended forever.
    if (!locked) await deps.staff.recordLoginFailure(username, now);
    throw denied();
  }

  const session = await issueSession(deps, "staff", account.id, STAFF_SESSION_MS);
  return { ...session, role: account.role };
}
