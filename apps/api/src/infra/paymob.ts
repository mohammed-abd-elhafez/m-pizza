import { createHmac, timingSafeEqual } from "node:crypto";
import type { Checkout, CheckoutRequest, PaymentGateway, WebhookEvent } from "../application/payment-ports";

/**
 * Paymob "Accept" adapter (hosted iframe checkout).
 *
 * NOT YET VERIFIED AGAINST A LIVE ACCOUNT. The three request steps and endpoints below follow Paymob's classic
 * Accept flow as recalled by the author; Paymob's documentation site could not be fetched during development
 * (TLS certificate mismatch). The callback HMAC field order follows the published "Transaction Callbacks" page
 * as quoted by a search snippet. Before going live, run it against Paymob's sandbox and confirm: endpoint paths,
 * request fields, and the HMAC against a real callback.
 */
export interface PaymobConfig {
  readonly apiKey: string;
  readonly integrationId: number;
  readonly iframeId: number;
  readonly hmacSecret: string;
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
}

/** Fields concatenated, in this order, to compute the callback HMAC (SHA-512, hex). */
export const PAYMOB_HMAC_FIELDS = [
  "amount_cents", "created_at", "currency", "error_occured", "has_parent_transaction", "id", "integration_id",
  "is_3d_secure", "is_auth", "is_capture", "is_refunded", "is_standalone_payment", "is_voided",
  "order.id", "owner", "pending", "source_data.pan", "source_data.sub_type", "source_data.type", "success",
] as const;

const REQUEST_TIMEOUT_MS = 10_000;

function read(obj: unknown, path: string): string {
  let cur: unknown = obj;
  for (const part of path.split(".")) {
    if (cur === null || typeof cur !== "object") return "";
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur === null || cur === undefined ? "" : String(cur);
}

export class PaymobGateway implements PaymentGateway {
  readonly provider = "paymob" as const;
  private readonly base: string;
  private readonly http: typeof fetch;

  constructor(private readonly cfg: PaymobConfig) {
    this.base = cfg.baseUrl ?? "https://accept.paymob.com";
    this.http = cfg.fetch ?? fetch;
  }

  async createCheckout(req: CheckoutRequest): Promise<Checkout> {
    const auth = await this.post<{ token: string }>("/api/auth/tokens", { api_key: this.cfg.apiKey });
    const order = await this.post<{ id: number }>("/api/ecommerce/orders", {
      auth_token: auth.token,
      delivery_needed: false,
      amount_cents: req.amountPiastres,
      currency: "EGP",
      merchant_order_id: req.merchantOrderId,
      items: [],
    });
    const key = await this.post<{ token: string }>("/api/acceptance/payment_keys", {
      auth_token: auth.token,
      amount_cents: req.amountPiastres,
      expiration: 3600,
      order_id: order.id,
      currency: "EGP",
      integration_id: this.cfg.integrationId,
      billing_data: {
        first_name: "NA", last_name: "NA", email: "NA", phone_number: req.customerPhone, apartment: "NA", floor: "NA",
        street: "NA", building: "NA", shipping_method: "NA", postal_code: "NA", city: "NA", country: "EG", state: "NA",
      },
    });
    return {
      providerRef: String(order.id),
      redirectUrl: `${this.base}/api/acceptance/iframes/${this.cfg.iframeId}?payment_token=${encodeURIComponent(key.token)}`,
    };
  }

  verifyWebhook(req: { rawBody: string; query: Readonly<Record<string, string | undefined>> }): WebhookEvent | null {
    const supplied = req.query["hmac"];
    if (!supplied) return null;

    let body: { type?: unknown; obj?: unknown };
    try {
      body = JSON.parse(req.rawBody) as { type?: unknown; obj?: unknown };
    } catch {
      return null;
    }
    const obj = body.obj;
    if (obj === null || typeof obj !== "object") return null;

    const message = PAYMOB_HMAC_FIELDS.map((f) => read(obj, f)).join("");
    const expected = createHmac("sha512", this.cfg.hmacSecret).update(message).digest();
    const given = Buffer.from(supplied.toLowerCase(), "hex");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

    // These fields are covered by the signature; reject callbacks that are not for this merchant's EGP transactions.
    if (body.type !== "TRANSACTION") return null;
    if (read(obj, "currency") !== "EGP" || read(obj, "integration_id") !== String(this.cfg.integrationId)) return null;

    const amount = Number(read(obj, "amount_cents"));
    const providerRef = read(obj, "order.id");
    if (!providerRef || !Number.isInteger(amount)) return null;
    return {
      providerRef,
      transactionId: read(obj, "id"),
      success: read(obj, "success") === "true",
      pending: read(obj, "pending") === "true",
      // Only a full refund or a void marks the order refunded; a partial refund is left for staff to handle.
      refunded: read(obj, "is_voided") === "true" || (read(obj, "is_refunded") === "true" && Number(read(obj, "refunded_amount_cents")) >= amount),
      amountPiastres: amount,
    };
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await this.http(`${this.base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Payment provider returned HTTP ${res.status} for ${path}`);
    return (await res.json()) as T;
  }
}
