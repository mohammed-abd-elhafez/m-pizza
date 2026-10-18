import { AppError } from "./errors";
import type {
  AuthDeps,
  CustomerPrincipal,
  IssuedSession,
  StaffPrincipal,
  SubjectType,
} from "./auth-ports";

export const CUSTOMER_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
export const STAFF_SESSION_MS = 12 * 60 * 60 * 1000;

export async function issueSession(
  deps: AuthDeps,
  subjectType: SubjectType,
  subjectId: number,
  ttlMs: number,
): Promise<IssuedSession> {
  const token = deps.secrets.newSessionToken();
  const expiresAt = new Date(deps.now().getTime() + ttlMs);
  await deps.sessions.create({ tokenHash: deps.secrets.hashToken(token), subjectType, subjectId, expiresAt });
  return { token, expiresAt };
}

const unauthorized = () => new AppError("UNAUTHORIZED", "Authentication required");

export async function authenticateCustomer(deps: AuthDeps, token: string): Promise<CustomerPrincipal> {
  const session = await deps.sessions.find(deps.secrets.hashToken(token), deps.now());
  if (session?.subjectType !== "customer") throw unauthorized();
  const customer = await deps.customers.findById(session.subjectId);
  if (!customer) throw unauthorized();
  return { customerId: customer.id, phone: customer.phone };
}

export async function authenticateStaff(deps: AuthDeps, token: string): Promise<StaffPrincipal> {
  const session = await deps.sessions.find(deps.secrets.hashToken(token), deps.now());
  if (session?.subjectType !== "staff") throw unauthorized();
  const account = await deps.staff.findById(session.subjectId);
  if (!account?.isActive) throw unauthorized();
  return { staffId: account.id, username: account.username, role: account.role, branchId: account.branchId };
}

export async function logout(deps: AuthDeps, token: string): Promise<void> {
  await deps.sessions.revoke(deps.secrets.hashToken(token));
}
