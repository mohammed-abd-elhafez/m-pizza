import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp, type AppDeps } from "../src/http/app";
import { fingerprint } from "../src/infra/crypto";
import { FakeAdminRepo } from "./support/fake-admin";
import { Clock, FakeCatalogRepo, FakeOrderRepo, RecordingEvents, makeAuth } from "./support/fakes";

let app: FastifyInstance | undefined;
let dir: string | undefined;

async function boot(over: Partial<AppDeps> = {}): Promise<FastifyInstance> {
  const clock = new Clock();
  const auth = makeAuth(clock);
  app = buildApp({
    catalog: new FakeCatalogRepo(),
    orders: new FakeOrderRepo(clock),
    events: new RecordingEvents(),
    auth: auth.deps,
    admin: new FakeAdminRepo(),
    newToken: () => "tracking-token-1",
    fingerprint,
    now: clock.now,
    logger: false,
    ...over,
  });
  await app.ready();
  return app;
}

afterEach(async () => {
  await app?.close();
  if (dir) await rm(dir, { recursive: true, force: true });
  app = undefined;
  dir = undefined;
});

describe("security logging", () => {
  const SECRET_PASSWORD = "very-secret-password-123";
  const SECRET_TOKEN = "secret-bearer-token-value-xyz";

  it("records failed logins, access denials and throttling as structured events, and never writes secrets", async () => {
    const lines: string[] = [];
    const a = await boot({ logger: true, logStream: { write: (m: string) => void lines.push(m) } });

    await a.inject({ method: "POST", url: "/staff/login", payload: { username: "ghost-user", password: SECRET_PASSWORD } });
    await a.inject({ method: "GET", url: "/admin/items", headers: { authorization: `Bearer ${SECRET_TOKEN}` } });
    await a.inject({ method: "GET", url: "/orders/track/some-tracking-token-12345" });
    for (let i = 0; i < 7; i++) await a.inject({ method: "POST", url: "/staff/login", payload: { username: "ghost-user", password: SECRET_PASSWORD } });

    const events = lines.map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(events.some((e) => e["event"] === "staff_login_failed" && e["username"] === "ghost-user")).toBe(true);
    expect(events.some((e) => e["event"] === "security" && e["status"] === 401 && e["route"] === "/admin/items")).toBe(true);
    expect(events.some((e) => e["event"] === "security" && e["status"] === 429)).toBe(true);

    const all = lines.join("\n");
    expect(all).not.toContain(SECRET_PASSWORD);
    expect(all).not.toContain(SECRET_TOKEN);
    expect(all).not.toContain("some-tracking-token-12345");
    expect(all).toContain("/orders/track/[redacted]");
  });
});

describe("hardening headers", () => {
  it("every response denies framing, sniffing, powerful features and cross-origin window access", async () => {
    const a = await boot();
    const h = (await a.inject("/health")).headers;
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["cross-origin-opener-policy"]).toBe("same-origin");
    expect(String(h["permissions-policy"])).toContain("geolocation=()");
    expect(h["referrer-policy"]).toBe("no-referrer");
    expect(h["x-powered-by"]).toBeUndefined();
    expect(h["server"]).toBeUndefined();
  });
});

describe("CORS", () => {
  const preflight = (a: FastifyInstance, origin: string) =>
    a.inject({
      method: "OPTIONS",
      url: "/orders",
      headers: { origin, "access-control-request-method": "POST", "access-control-request-headers": "authorization,idempotency-key,content-type" },
    });

  it("is off by default: no origin is allowed", async () => {
    const a = await boot();
    const res = await preflight(a, "http://localhost:8080");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("allows only the exact configured origins, with the headers the app needs", async () => {
    const a = await boot({ allowedOrigins: ["http://localhost:8080"] });
    const ok = await preflight(a, "http://localhost:8080");
    expect(ok.headers["access-control-allow-origin"]).toBe("http://localhost:8080");
    expect(String(ok.headers["access-control-allow-headers"]).toLowerCase()).toContain("idempotency-key");
    expect(ok.headers["access-control-allow-credentials"]).toBeUndefined();

    for (const bad of ["http://evil.example", "http://localhost:8081", "https://localhost:8080"]) {
      expect((await preflight(a, bad)).headers["access-control-allow-origin"]).toBeUndefined();
    }
  });
});

describe("staff web hosting", () => {
  it("serves the static app with a strict CSP, and nothing else gets that policy", async () => {
    dir = await mkdtemp(join(tmpdir(), "staff-"));
    await writeFile(join(dir, "index.html"), "<!doctype html><title>staff</title>");
    await writeFile(join(dir, "app.js"), "console.log(1)");
    const a = await boot({ staffWebRoot: dir });

    const page = await a.inject("/staff/");
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain("<title>staff</title>");
    expect(page.headers["content-security-policy"]).toContain("script-src 'self'");
    expect(page.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(page.headers["content-security-policy"]).not.toContain("unsafe-inline");
    expect((await a.inject("/staff/app.js")).statusCode).toBe(200);

    // JSON API responses get the stricter deny-everything policy instead.
    const api = (await a.inject("/health")).headers["content-security-policy"];
    expect(api).toBe("default-src 'none'; frame-ancestors 'none'");
    expect(api).not.toBe(page.headers["content-security-policy"]);
  });

  it("does not expose files outside the root", async () => {
    dir = await mkdtemp(join(tmpdir(), "staff-"));
    await writeFile(join(dir, "index.html"), "x");
    const a = await boot({ staffWebRoot: dir });
    for (const path of ["/staff/../package.json", "/staff/%2e%2e/package.json", "/staff/..%2fpackage.json"]) {
      expect((await a.inject(path)).statusCode).not.toBe(200);
    }
  });
});
