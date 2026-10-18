import type { FastifyRequest } from "fastify";
import { AppError } from "../application/errors";
import type { AuthDeps, CustomerPrincipal, StaffPrincipal } from "../application/auth-ports";
import { authenticateCustomer, authenticateStaff } from "../application/sessions";
import { can, type Permission } from "../domain/policy";

declare module "fastify" {
  interface FastifyRequest {
    customer?: CustomerPrincipal;
    staff?: StaffPrincipal;
  }
}

export function bearerToken(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 && token.length <= 200 ? token : null;
}

const unauthorized = () => new AppError("UNAUTHORIZED", "Authentication required");

export function requireCustomer(auth: AuthDeps) {
  return async (req: FastifyRequest): Promise<void> => {
    const token = bearerToken(req);
    if (!token) throw unauthorized();
    req.customer = await authenticateCustomer(auth, token);
  };
}

/** Authenticates staff and checks the role grants `permission` (deny by default). */
export function requireStaff(auth: AuthDeps, permission: Permission) {
  return async (req: FastifyRequest): Promise<void> => {
    const token = bearerToken(req);
    if (!token) throw unauthorized();
    const staff = await authenticateStaff(auth, token);
    if (!can(staff.role, permission)) throw new AppError("FORBIDDEN", "You do not have access to this resource");
    req.staff = staff;
  };
}
