import { describe, expect, it } from "vitest";
import { loadBrand, loadServerConfig } from "../src/config";

describe("loadBrand", () => {
  it("defaults to M Pizza and can be overridden", () => {
    expect(loadBrand({}).name).toBe("M Pizza");
    expect(loadBrand({ BRAND_NAME: "Other" }).name).toBe("Other");
  });
});

describe("loadServerConfig", () => {
  const ok = { DATABASE_URL: "postgres://x", OTP_SECRET: "x".repeat(32) };

  it("requires DATABASE_URL and a long OTP_SECRET", () => {
    expect(() => loadServerConfig({ OTP_SECRET: ok.OTP_SECRET })).toThrow(/DATABASE_URL/);
    expect(() => loadServerConfig({ DATABASE_URL: "postgres://x" })).toThrow(/OTP_SECRET/);
    expect(() => loadServerConfig({ ...ok, OTP_SECRET: "short" })).toThrow(/OTP_SECRET/);
  });

  it("binds to loopback on port 3000 by default, outside production, with no proxy and no payments", () => {
    expect(loadServerConfig(ok)).toMatchObject({ host: "127.0.0.1", port: 3000, production: false, trustProxyHops: 0, paymob: null });
  });

  it("validates PORT", () => {
    expect(() => loadServerConfig({ ...ok, PORT: "abc" })).toThrow(/PORT/);
    expect(() => loadServerConfig({ ...ok, PORT: "70000" })).toThrow(/PORT/);
  });

  it("refuses to listen publicly without a TLS proxy in front", () => {
    expect(() => loadServerConfig({ ...ok, HOST: "0.0.0.0" })).toThrow(/TRUST_PROXY_HOPS/);
    expect(loadServerConfig({ ...ok, HOST: "0.0.0.0", TRUST_PROXY_HOPS: "1" })).toMatchObject({ host: "0.0.0.0", trustProxyHops: 1 });
    expect(() => loadServerConfig({ ...ok, TRUST_PROXY_HOPS: "9" })).toThrow(/TRUST_PROXY_HOPS/);
  });

  it("enables Paymob only when fully configured", () => {
    const all = { PAYMOB_API_KEY: "k", PAYMOB_INTEGRATION_ID: "11", PAYMOB_IFRAME_ID: "22", PAYMOB_HMAC_SECRET: "h" };
    expect(loadServerConfig({ ...ok, ...all }).paymob).toEqual({ apiKey: "k", integrationId: 11, iframeId: 22, hmacSecret: "h" });
    expect(() => loadServerConfig({ ...ok, PAYMOB_API_KEY: "k" })).toThrow(/Incomplete Paymob/);
    expect(() => loadServerConfig({ ...ok, ...all, PAYMOB_IFRAME_ID: "abc" })).toThrow(/integers/);
  });

  it("detects production", () => {
    expect(loadServerConfig({ ...ok, NODE_ENV: "production" }).production).toBe(true);
  });
  it("accepts only exact CORS origins", () => {
    expect(loadServerConfig(ok).allowedOrigins).toEqual([]);
    expect(loadServerConfig({ ...ok, ALLOWED_ORIGINS: "http://localhost:8080, https://app.example.com" }).allowedOrigins).toEqual([
      "http://localhost:8080",
      "https://app.example.com",
    ]);
    for (const bad of ["*", "http://localhost:8080/", "ftp://x.test", "https://*.example.com", "localhost:8080"]) {
      expect(() => loadServerConfig({ ...ok, ALLOWED_ORIGINS: bad })).toThrow(/ALLOWED_ORIGINS/);
    }
  });});
