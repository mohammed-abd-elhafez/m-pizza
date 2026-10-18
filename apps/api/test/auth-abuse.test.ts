import { beforeEach, describe, expect, it } from "vitest";
import {
  OTP_LOCK_WINDOW_MS,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_FAILED_PER_DAY,
  OTP_REQUEST_WINDOW_MS,
  requestOtp,
  verifyOtp,
} from "../src/application/customer-auth";
import { AppError } from "../src/application/errors";
import { STAFF_FAILURE_WINDOW_MS, STAFF_MAX_FAILURES, staffLogin } from "../src/application/staff-login";
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

describe("OTP brute-force resistance", () => {
  it("requesting fresh codes does not reset the guess budget: the phone locks after the daily cap", async () => {
    let wrongGuesses = 0;
    while (wrongGuesses < OTP_MAX_FAILED_PER_DAY) {
      await requestOtp(t.deps, PHONE);
      const good = t.sender.last(PHONE);
      const wrong = good === "000000" ? "000001" : "000000";
      for (let i = 0; i < OTP_MAX_ATTEMPTS && wrongGuesses < OTP_MAX_FAILED_PER_DAY; i++) {
        expect(await code(verifyOtp(t.deps, PHONE, wrong))).toBe("UNAUTHORIZED");
        wrongGuesses += 1;
      }
      clock.advance(OTP_REQUEST_WINDOW_MS + 1);
    }

    await requestOtp(t.deps, PHONE);
    const fresh = t.sender.last(PHONE);
    expect(await code(verifyOtp(t.deps, PHONE, fresh))).toBe("UNAUTHORIZED"); // even the right code is refused

    clock.advance(OTP_LOCK_WINDOW_MS + 1);
    await requestOtp(t.deps, PHONE);
    await expect(verifyOtp(t.deps, PHONE, t.sender.last(PHONE))).resolves.toMatchObject({ token: expect.any(String) });
  });

  it("successful logins never count against the cap", async () => {
    for (let i = 0; i < OTP_MAX_FAILED_PER_DAY + 3; i++) {
      await requestOtp(t.deps, PHONE);
      await verifyOtp(t.deps, PHONE, t.sender.last(PHONE));
      clock.advance(OTP_REQUEST_WINDOW_MS + 1);
    }
  });

  it("a locked phone does not affect other phones", async () => {
    await requestOtp(t.deps, "+201155555555");
    await expect(verifyOtp(t.deps, "+201155555555", t.sender.last("+201155555555"))).resolves.toBeDefined();
  });
});

describe("staff login lockout", () => {
  beforeEach(async () => {
    await t.addStaff("amira", "correct horse battery", "kitchen", 1);
  });

  it("locks the account after repeated failures, refuses even the right password, then unlocks by itself", async () => {
    for (let i = 0; i < STAFF_MAX_FAILURES; i++) {
      expect(await code(staffLogin(t.deps, "amira", "wrong password here"))).toBe("UNAUTHORIZED");
    }
    expect(await code(staffLogin(t.deps, "amira", "correct horse battery"))).toBe("UNAUTHORIZED");

    // Attempts made while locked are not counted, so the lock cannot be extended by hammering it.
    clock.advance(STAFF_FAILURE_WINDOW_MS - 60_000);
    expect(await code(staffLogin(t.deps, "amira", "correct horse battery"))).toBe("UNAUTHORIZED");
    clock.advance(2 * 60_000);
    await expect(staffLogin(t.deps, "amira", "correct horse battery")).resolves.toMatchObject({ role: "kitchen" });
  });

  it("failures of one account do not lock another, and unknown usernames are throttled too", async () => {
    await t.addStaff("hassan", "another long password", "admin");
    for (let i = 0; i < STAFF_MAX_FAILURES; i++) await code(staffLogin(t.deps, "amira", "wrong password here"));
    await expect(staffLogin(t.deps, "hassan", "another long password")).resolves.toMatchObject({ role: "admin" });

    for (let i = 0; i < STAFF_MAX_FAILURES; i++) await code(staffLogin(t.deps, "ghost", "whatever password"));
    expect(await code(staffLogin(t.deps, "ghost", "whatever password"))).toBe("UNAUTHORIZED");
  });
});
