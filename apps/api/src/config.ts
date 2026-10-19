export interface BrandConfig {
  readonly name: string;
  readonly nameAr: string;
}

export interface PaymobSettings {
  readonly mode: "intention" | "classic";
  readonly apiKey?: string;
  readonly secretKey?: string;
  readonly publicKey?: string;
  readonly paymentMethodIds?: readonly number[];
  readonly integrationId?: number;
  readonly iframeId?: number;
  readonly hmacSecret: string;
  readonly baseUrl: string;
  readonly notificationUrl?: string;
  readonly redirectionUrl?: string;
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

function exactHttpsUrl(name: string, value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error(`${name} must be an https origin without credentials, path, query or hash`);
  }
  return url.origin;
}

function publicHttpsUrl(name: string, value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    throw new Error(`${name} must be a public https URL without credentials or a hash`);
  }
  return url.toString();
}

function parsePaymentMethodIds(raw: string): number[] {
  const values = raw.split(",").map((value) => Number(value.trim()));
  if (values.length === 0 || values.some((value) => !Number.isInteger(value) || value <= 0)) {
    throw new Error("PAYMOB_PAYMENT_METHOD_IDS must be a comma-separated list of positive integers");
  }
  return [...new Set(values)];
}

function loadPaymob(env: Env): PaymobSettings | null {
  const paymobKeys = [
    "PAYMOB_API_KEY", "PAYMOB_SECRET_KEY", "PAYMOB_PUBLIC_KEY", "PAYMOB_PAYMENT_METHOD_IDS",
    "PAYMOB_INTEGRATION_ID", "PAYMOB_IFRAME_ID", "PAYMOB_HMAC_SECRET", "PAYMOB_NOTIFICATION_URL",
    "PAYMOB_REDIRECTION_URL", "PAYMOB_MODE", "PAYMOB_BASE_URL",
  ] as const;
  if (!paymobKeys.some((key) => env[key])) return null;

  const mode = env["PAYMOB_MODE"] ?? (env["PAYMOB_SECRET_KEY"] || env["PAYMOB_PUBLIC_KEY"] ? "intention" : "classic");
  if (mode !== "intention" && mode !== "classic") throw new Error("PAYMOB_MODE must be intention or classic");
  const hmacSecret = env["PAYMOB_HMAC_SECRET"];
  if (!hmacSecret) throw new Error("Incomplete Paymob configuration: PAYMOB_HMAC_SECRET is required");
  const baseUrl = exactHttpsUrl("PAYMOB_BASE_URL", env["PAYMOB_BASE_URL"] ?? "https://accept.paymob.com");

  if (mode === "intention") {
    const required = ["PAYMOB_SECRET_KEY", "PAYMOB_PUBLIC_KEY", "PAYMOB_PAYMENT_METHOD_IDS", "PAYMOB_NOTIFICATION_URL"] as const;
    const missing = required.filter((key) => !env[key]);
    if (missing.length > 0) throw new Error(`Incomplete Paymob intention configuration: set ${missing.join(", ")}`);
    if (env["NODE_ENV"] !== "production" && [env["PAYMOB_SECRET_KEY"], env["PAYMOB_PUBLIC_KEY"]].some((key) => key?.includes("_live"))) {
      throw new Error("Live Paymob keys are not allowed outside NODE_ENV=production");
    }
    return {
      mode,
      secretKey: env["PAYMOB_SECRET_KEY"],
      publicKey: env["PAYMOB_PUBLIC_KEY"],
      paymentMethodIds: parsePaymentMethodIds(env["PAYMOB_PAYMENT_METHOD_IDS"]!),
      hmacSecret,
      baseUrl,
      notificationUrl: publicHttpsUrl("PAYMOB_NOTIFICATION_URL", env["PAYMOB_NOTIFICATION_URL"]!),
      ...(env["PAYMOB_REDIRECTION_URL"]
        ? { redirectionUrl: publicHttpsUrl("PAYMOB_REDIRECTION_URL", env["PAYMOB_REDIRECTION_URL"]) }
        : {}),
    };
  }

  const required = ["PAYMOB_API_KEY", "PAYMOB_INTEGRATION_ID", "PAYMOB_IFRAME_ID"] as const;
  const missing = required.filter((key) => !env[key]);
  if (missing.length > 0) throw new Error(`Incomplete Paymob classic configuration: set ${missing.join(", ")}`);
  const integrationId = Number(env["PAYMOB_INTEGRATION_ID"]);
  const iframeId = Number(env["PAYMOB_IFRAME_ID"]);
  if (!Number.isInteger(integrationId) || !Number.isInteger(iframeId)) {
    throw new Error("PAYMOB_INTEGRATION_ID and PAYMOB_IFRAME_ID must be integers");
  }
  return { mode, apiKey: env["PAYMOB_API_KEY"], integrationId, iframeId, hmacSecret, baseUrl };
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
