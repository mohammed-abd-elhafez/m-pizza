import type { FastifyInstance } from "fastify";
import { requestOtp, verifyOtp } from "../../application/customer-auth";
import { logout } from "../../application/sessions";
import { staffLogin } from "../../application/staff-login";
import { AppError } from "../../application/errors";
import { bearerToken } from "../auth-hooks";
import type { AppDeps } from "../deps";
import { otpRequestSchema, otpVerifySchema, staffLoginSchema } from "../schemas";

const limit = (max: number) => ({ config: { rateLimit: { max, timeWindow: "1 minute" } } });

export function authRoutes(deps: AppDeps) {
  return async (api: FastifyInstance): Promise<void> => {
    // Always 202, whether or not a code was actually sent (no enumeration, no throttle oracle).
    api.post("/auth/otp/request", limit(5), async (req, reply) => {
      const { phone } = otpRequestSchema.parse(req.body);
      await requestOtp(deps.auth, phone);
      return reply.code(202).send({ status: "accepted" });
    });

    api.post("/auth/otp/verify", limit(10), async (req) => {
      const { phone, code } = otpVerifySchema.parse(req.body);
      const session = await verifyOtp(deps.auth, phone, code);
      return { token: session.token, expiresAt: session.expiresAt.toISOString(), phone };
    });

    api.post("/staff/login", limit(5), async (req) => {
      const { username, password } = staffLoginSchema.parse(req.body);
      try {
        const session = await staffLogin(deps.auth, username, password);
        req.log.info({ event: "staff_login", username, role: session.role }, "staff signed in");
        return { token: session.token, expiresAt: session.expiresAt.toISOString(), role: session.role };
      } catch (err) {
        if (err instanceof AppError) req.log.warn({ event: "staff_login_failed", username, ip: req.ip }, "staff sign-in failed");
        throw err;
      }
    });

    api.post("/auth/logout", async (req, reply) => {
      const token = bearerToken(req);
      if (!token) throw new AppError("UNAUTHORIZED", "Authentication required");
      await logout(deps.auth, token);
      return reply.code(204).send();
    });
  };
}
