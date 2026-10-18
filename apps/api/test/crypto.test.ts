import { describe, expect, it } from "vitest";
import { NodeSecretService, fingerprint } from "../src/infra/crypto";
import { OTP_SECRET } from "./support/fakes";

const secrets = new NodeSecretService(OTP_SECRET);

describe("NodeSecretService", () => {
  it("hashes passwords with a unique salt and verifies them", async () => {
    const a = await secrets.hashPassword("correct horse battery");
    const b = await secrets.hashPassword("correct horse battery");
    expect(a).not.toBe(b);
    expect(a.startsWith("scrypt$")).toBe(true);
    expect(await secrets.verifyPassword("correct horse battery", a)).toBe(true);
    expect(await secrets.verifyPassword("Correct horse battery", a)).toBe(false);
  });

  it("returns false for unknown users and malformed hashes without throwing", async () => {
    expect(await secrets.verifyPassword("anything at all", null)).toBe(false);
    expect(await secrets.verifyPassword("anything at all", "not-a-hash")).toBe(false);
    expect(await secrets.verifyPassword("anything at all", "bcrypt$1$2$3$4$5")).toBe(false);
  });

  it("generates 6-digit codes and url-safe session tokens that hash deterministically", () => {
    for (let i = 0; i < 50; i++) expect(secrets.newOtpCode()).toMatch(/^\d{6}$/);
    const token = secrets.newSessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(secrets.newSessionToken()).not.toBe(token);
    expect(secrets.hashToken(token)).toBe(secrets.hashToken(token));
    expect(secrets.hashToken(token)).not.toContain(token);
  });

  it("binds OTP digests to both phone and code and compares them safely", () => {
    const d = secrets.digestOtp("+201012345678", "123456");
    expect(secrets.equalDigests(d, secrets.digestOtp("+201012345678", "123456"))).toBe(true);
    expect(secrets.equalDigests(d, secrets.digestOtp("+201012345678", "123457"))).toBe(false);
    expect(secrets.equalDigests(d, secrets.digestOtp("+201012345679", "123456"))).toBe(false);
    expect(secrets.equalDigests(d, "zz")).toBe(false);
  });

  it("refuses a short OTP secret", () => {
    expect(() => new NodeSecretService("short")).toThrow(/at least 32/);
  });
});

describe("fingerprint", () => {
  it("ignores key order and undefined fields but sees real differences", () => {
    expect(fingerprint({ a: 1, b: { c: [1, 2], d: 3 } })).toBe(fingerprint({ b: { d: 3, c: [1, 2] }, a: 1, z: undefined }));
    expect(fingerprint({ a: 1 })).not.toBe(fingerprint({ a: 2 }));
    expect(fingerprint([1, 2])).not.toBe(fingerprint([2, 1]));
  });
});
