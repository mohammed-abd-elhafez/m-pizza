import { beforeEach, describe, expect, it } from "vitest";
import { AppError } from "../src/application/errors";
import {
  OTP_MAX_ATTEMPTS,
  OTP_MAX_REQUESTS_PER_WINDOW,
  OTP_REQUEST_WINDOW_MS,
  OTP_TTL_MS,
  requestOtp,
  verifyOtp,
} from "../src/application/customer-auth";
import { authenticateCustomer, authenticateStaff, logout } from "../src/application/sessions";
import { staffLogin } from "../src/application/staff-login";
import { can } from "../src/domain/policy";
import { Clock, makeAuth, type TestAuth } from "./support/fakes";

const PHONE = "+201012345678";
let t: TestAuth;
let clock: Clock;

const code = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
  } catch (e) {
    if (e instanceof AppError) return e.code;
    throw e;
  }
  return "NO_ERROR";
};

beforeEach(() => {
  clock = new Clock();
  t = makeAuth(clock);
});

describe("customer OTP login", () => {
  it("issues a session for the right code and authenticates it", async () => {
    await requestOtp(t.deps, PHONE);
    const session = await verifyOtp(t.deps, PHONE, t.sender.last(PHONE));
    const principal = await authenticateCustomer(t.deps, session.token);
    expect(principal).toMatchObject({ phone: PHONE });
    expect(session.expiresAt.getTime()).toBeGreaterThan(clock.now().getTime());
  });

  it("never stores the code or the session token in clear", async () => {
    await requestOtp(t.deps, PHONE);
    const sent = t.sender.last(PHONE);
    expect(JSON.stringify(t.otps.rows)).not.toContain(sent);
    const session = await verifyOtp(t.deps, PHONE, sent);
    expect([...t.sessions.rows.keys()]).not.toContain(session.token);
  });

  it("rejects wrong, expired and reused codes with one indistinguishable error", async () => {
    await requestOtp(t.deps, PHONE);
    const good = t.sender.last(PHONE);
    const wrong = good === "000000" ? "000001" : "000000";
    expect(await code(verifyOtp(t.deps, PHONE, wrong))).toBe("UNAUTHORIZED");

    await verifyOtp(t.deps, PHONE, good);
    expect(await code(verifyOtp(t.deps, PHONE, good))).toBe("UNAUTHORIZED"); // already consumed

    await requestOtp(t.deps, PHONE);
    clock.advance(OTP_TTL_MS + 1);
    expect(await code(verifyOtp(t.deps, PHONE, t.sender.last(PHONE)))).toBe("UNAUTHORIZED"); // expired
  });

  it("locks a challenge after the maximum number of guesses, even for the right code", async () => {
    await requestOtp(t.deps, PHONE);
    const good = t.sender.last(PHONE);
    const wrong = good === "000000" ? "000001" : "000000";
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) await code(verifyOtp(t.deps, PHONE, wrong));
    expect(await code(verifyOtp(t.deps, PHONE, good))).toBe("UNAUTHORIZED");
  });

  it("unknown phones fail the same way", async () => {
    expect(await code(verifyOtp(t.deps, "+201099999999", "123456"))).toBe("UNAUTHORIZED");
  });

  it("throttles requests per phone silently and recovers after the window", async () => {
    for (let i = 0; i < OTP_MAX_REQUESTS_PER_WINDOW + 2; i++) await requestOtp(t.deps, PHONE);
    expect(t.sender.sent).toHaveLength(OTP_MAX_REQUESTS_PER_WINDOW);
    clock.advance(OTP_REQUEST_WINDOW_MS + 1);
    await requestOtp(t.deps, PHONE);
    expect(t.sender.sent).toHaveLength(OTP_MAX_REQUESTS_PER_WINDOW + 1);
  });

  it("only the newest code works", async () => {
    await requestOtp(t.deps, PHONE);
    const first = t.sender.last(PHONE);
    clock.advance(1000);
    await requestOtp(t.deps, PHONE);
    const second = t.sender.last(PHONE);
    if (first !== second) expect(await code(verifyOtp(t.deps, PHONE, first))).toBe("UNAUTHORIZED");
    await expect(verifyOtp(t.deps, PHONE, second)).resolves.toMatchObject({ token: expect.any(String) });
  });
});

describe("sessions", () => {
  it("expire, can be revoked, and are scoped by subject type", async () => {
    await requestOtp(t.deps, PHONE);
    const s = await verifyOtp(t.deps, PHONE, t.sender.last(PHONE));

    expect(await code(authenticateStaff(t.deps, s.token))).toBe("UNAUTHORIZED"); // a customer token is not a staff token
    await logout(t.deps, s.token);
    expect(await code(authenticateCustomer(t.deps, s.token))).toBe("UNAUTHORIZED");

    await requestOtp(t.deps, PHONE);
    const s2 = await verifyOtp(t.deps, PHONE, t.sender.last(PHONE));
    clock.advance(31 * 24 * 60 * 60 * 1000);
    expect(await code(authenticateCustomer(t.deps, s2.token))).toBe("UNAUTHORIZED");
  });

  it("rejects garbage tokens", async () => {
    expect(await code(authenticateCustomer(t.deps, "nope"))).toBe("UNAUTHORIZED");
  });
});

describe("staff login", () => {
  beforeEach(async () => {
    await t.addStaff("amira", "correct horse battery", "kitchen", 1);
    await t.addStaff("hassan", "another long password", "admin");
    await t.addStaff("gone", "former employee pw", "kitchen", null, false);
  });

  it("logs in with the right password and exposes role and branch", async () => {
    const s = await staffLogin(t.deps, "amira", "correct horse battery");
    expect(s.role).toBe("kitchen");
    expect(await authenticateStaff(t.deps, s.token)).toMatchObject({ username: "amira", role: "kitchen", branchId: 1 });
  });

  it("gives one generic error for wrong password, unknown user and disabled account", async () => {
    for (const [u, p] of [["amira", "wrong password!!"], ["nobody", "whatever password"], ["gone", "former employee pw"]] as const) {
      expect(await code(staffLogin(t.deps, u, p))).toBe("UNAUTHORIZED");
    }
  });

  it("a deactivated account's existing session stops working", async () => {
    const s = await staffLogin(t.deps, "amira", "correct horse battery");
    const account = await t.deps.staff.findByUsername("amira");
    (account as { isActive: boolean }).isActive = false;
    expect(await code(authenticateStaff(t.deps, s.token))).toBe("UNAUTHORIZED");
  });

  it("staff sessions expire after the shift", async () => {
    const s = await staffLogin(t.deps, "hassan", "another long password");
    clock.advance(13 * 60 * 60 * 1000);
    expect(await code(authenticateStaff(t.deps, s.token))).toBe("UNAUTHORIZED");
  });
});

describe("role policy", () => {
  it("kitchen can run orders but not administer; admin can do both; unknown roles get nothing", () => {
    expect(can("kitchen", "kitchen:read")).toBe(true);
    expect(can("kitchen", "kitchen:transition")).toBe(true);
    expect(can("kitchen", "admin:read")).toBe(false);
    expect(can("kitchen", "admin:write")).toBe(false);
    expect(can("admin", "admin:write")).toBe(true);
    expect(can("admin", "kitchen:transition")).toBe(true);
    expect(can("intern", "kitchen:read")).toBe(false);
    expect(can("__proto__", "kitchen:read")).toBe(false);
  });
});
