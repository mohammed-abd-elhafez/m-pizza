export interface BrandConfig {
  readonly name: string;
  readonly nameAr: string;
}

export interface PaymobSettings {
  readonly apiKey: string;
  readonly integrationId: number;
  readonly iframeId: number;
  readonly hmacSecret: string;
}

export interface ServerConfig {
  readonly port: number;
  readonly host: string;
  readonly databaseUrl: string;
  readonly otpSecret: string;
  readonly production: boolean;
  /** Reverse-proxy hops in front of the API; 0 means clients connect directly. */
  readonly trustProxyHops: number;
  readonly paymob: PaymobSettings | null;
  readonly allowedOrigins: readonly string[];
}

type Env = Readonly<Record<string, string | undefined>>;

export function loadBrand(env: Env = process.env): BrandConfig {
  return Object.freeze({
    name: env["BRAND_NAME"] ?? "M Pizza",
    nameAr: env["BRAND_NAME_AR"] ?? "إم بيتزا",
  });
}

const MIN_SECRET_LENGTH = 32;
const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1"]);

function loadPaymob(env: Env): PaymobSettings | null {
  const keys = ["PAYMOB_API_KEY", "PAYMOB_INTEGRATION_ID", "PAYMOB_IFRAME_ID", "PAYMOB_HMAC_SECRET"] as const;
  const present = keys.filter((k) => env[k]);
  if (present.length === 0) return null;
  if (present.length !== keys.length) {
    throw new Error(`Incomplete Paymob configuration: set all of ${keys.join(", ")} or none`);
  }
  const integrationId = Number(env["PAYMOB_INTEGRATION_ID"]);
  const iframeId = Number(env["PAYMOB_IFRAME_ID"]);
  if (!Number.isInteger(integrationId) || !Number.isInteger(iframeId)) {
    throw new Error("PAYMOB_INTEGRATION_ID and PAYMOB_IFRAME_ID must be integers");
  }
  return { apiKey: env["PAYMOB_API_KEY"]!, integrationId, iframeId, hmacSecret: env["PAYMOB_HMAC_SECRET"]! };
}

function loadOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(",").map((o) => o.trim()).filter(Boolean).map((o) => {
    // Exact origins only: scheme + host [+ port], no wildcard, path or trailing slash.
    if (!/^https?:\/\/[A-Za-z0-9.-]+(:\d{1,5})?$/.test(o)) throw new Error(`ALLOWED_ORIGINS contains an invalid origin: ${o}`);
    return o;
  });
}

export function loadServerConfig(env: Env = process.env): ServerConfig {
  const databaseUrl = env["DATABASE_URL"];
  if (!databaseUrl) throw new Error("DATABASE_URL is not configured");

  const otpSecret = env["OTP_SECRET"];
  if (!otpSecret || otpSecret.length < MIN_SECRET_LENGTH) {
    throw new Error(`OTP_SECRET must be set to at least ${MIN_SECRET_LENGTH} characters`);
  }

  const port = Number(env["PORT"] ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be an integer in 1..65535");

  const trustProxyHops = Number(env["TRUST_PROXY_HOPS"] ?? 0);
  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 5) {
    throw new Error("TRUST_PROXY_HOPS must be an integer in 0..5");
  }

  // Bind to loopback unless the operator opens it up, and only behind a TLS-terminating proxy.
  const host = env["HOST"] ?? "127.0.0.1";
  if (!LOOPBACK.has(host) && trustProxyHops === 0) {
    throw new Error("Refusing to listen on a non-loopback HOST without TRUST_PROXY_HOPS (run behind a TLS proxy)");
  }

  return Object.freeze({
    port,
    host,
    databaseUrl,
    otpSecret,
    production: env["NODE_ENV"] === "production",
    trustProxyHops,
    paymob: loadPaymob(env),
    allowedOrigins: loadOrigins(env["ALLOWED_ORIGINS"]),
  });
}
