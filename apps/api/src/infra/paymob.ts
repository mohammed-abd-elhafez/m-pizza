import { createHmac, timingSafeEqual } from "node:crypto";
import type { Checkout, CheckoutRequest, PaymentGateway, WebhookEvent } from "../application/payment-ports";

/**
 * Paymob Egypt configuration.
 *
 * Intention mode is the current flow and supports multiple payment method integrations through Unified Checkout.
 * Classic mode is retained only for existing merchants that still use the legacy iframe credentials.
 */
export interface PaymobConfig {
  readonly mode?: "intention" | "classic";
  readonly apiKey?: string;
  readonly secretKey?: string;
  readonly publicKey?: string;
  readonly paymentMethodIds?: readonly number[];
  readonly integrationId?: number;
  readonly iframeId?: number;
  readonly hmacSecret: string;
  readonly baseUrl?: string;
  readonly notificationUrl?: string;
  readonly redirectionUrl?: string;
  readonly fetch?: typeof fetch;
}

/** Fields concatenated, in this order, to compute the callback HMAC (SHA-512, hex). */
export const PAYMOB_HMAC_FIELDS = [
  "amount_cents", "created_at", "currency", "error_occured", "has_parent_transaction", "id", "integration_id",
  "is_3d_secure", "is_auth", "is_capture", "is_refunded", "is_standalone_payment", "is_voided",
  "order.id", "owner", "pending", "source_data.pan", "source_data.sub_type", "source_data.type", "success",
] as const;

const REQUEST_TIMEOUT_MS = 10_000;

type JsonRecord = Record<string, unknown>;

type IntentionResponse = {
  client_secret?: unknown;
  intention_order_id?: unknown;
  id?: unknown;
};

function read(obj: unknown, path: string): string {
  let cur: unknown = obj;
  for (const part of path.split(".")) {
    if (cur === null || typeof cur !== "object") return "";
    cur = (cur as JsonRecord)[part];
  }
  return cur === null || cur === undefined ? "" : String(cur);
}

export class PaymobGateway implements PaymentGateway {
  readonly provider = "paymob" as const;
  private readonly base: string;
  private readonly http: typeof fetch;

  constructor(private readonly cfg: PaymobConfig) {
    this.base = (cfg.baseUrl ?? "https://accept.paymob.com").replace(/\/$/, "");
    this.http = cfg.fetch ?? fetch;
  }

  async createCheckout(req: CheckoutRequest): Promise<Checkout> {
    const mode = this.cfg.mode ?? (this.cfg.secretKey ? "intention" : "classic");
    return mode === "intention" ? this.createIntentionCheckout(req) : this.createClassicCheckout(req);
  }

  private async createIntentionCheckout(req: CheckoutRequest): Promise<Checkout> {
    if (!this.cfg.secretKey || !this.cfg.publicKey || !this.cfg.paymentMethodIds?.length || !this.cfg.notificationUrl) {
      throw new Error("Paymob Intention API configuration is incomplete");
    }

    const intention = await this.post<IntentionResponse>(
      "/v1/intention/",
      {
        amount: req.amountPiastres,
        currency: "EGP",
        payment_methods: this.cfg.paymentMethodIds,
        items: [{ name: `M Pizza order ${req.merchantOrderId}`, amount: req.amountPiastres, quantity: 1 }],
        billing_data: {
          first_name: "M",
          last_name: "Pizza",
          email: "customer@mpizza.test",
          phone_number: req.customerPhone,
          street: "NA",
          building: "NA",
          floor: "NA",
          apartment: "NA",
          city: "Cairo",
          country: "EGY",
          state: "Cairo",
        },
        extras: { merchant_order_id: req.merchantOrderId },
        special_reference: req.merchantOrderId,
        expiration: 3600,
        notification_url: this.cfg.notificationUrl,
        ...(this.cfg.redirectionUrl ? { redirection_url: this.cfg.redirectionUrl } : {}),
      },
      { Authorization: `Token ${this.cfg.secretKey}` },
    );

    const clientSecret = typeof intention.client_secret === "string" ? intention.client_secret : "";
    const providerRef = intention.intention_order_id ?? intention.id;
    if (!clientSecret || (typeof providerRef !== "string" && typeof providerRef !== "number")) {
      throw new Error("Paymob returned an incomplete payment intention");
    }

    const checkout = new URL("/unifiedcheckout/", this.base);
    checkout.searchParams.set("publicKey", this.cfg.publicKey);
    checkout.searchParams.set("clientSecret", clientSecret);
    return { providerRef: String(providerRef), redirectUrl: checkout.toString() };
  }

  private async createClassicCheckout(req: CheckoutRequest): Promise<Checkout> {
    if (!this.cfg.apiKey || !Number.isInteger(this.cfg.integrationId) || !Number.isInteger(this.cfg.iframeId)) {
      throw new Error("Paymob Classic Accept configuration is incomplete");
    }
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
        first_name: "NA", last_name: "NA", email: "customer@mpizza.test", phone_number: req.customerPhone,
        apartment: "NA", floor: "NA", street: "NA", building: "NA", shipping_method: "NA", postal_code: "NA",
        city: "Cairo", country: "EG", state: "NA",
      },
    });
    return {
      providerRef: String(order.id),
      redirectUrl: `${this.base}/api/acceptance/iframes/${this.cfg.iframeId}?payment_token=${encodeURIComponent(key.token)}`,
    };
  }

  verifyWebhook(req: { rawBody: string; query: Readonly<Record<string, string | undefined>> }): WebhookEvent | null {
    const supplied = req.query["hmac"];
    if (!supplied || !/^[a-f0-9]{128}$/i.test(supplied)) return null;

    let body: { type?: unknown; obj?: unknown };
    try {
      body = JSON.parse(req.rawBody) as { type?: unknown; obj?: unknown };
    } catch {
      return null;
    }
    const obj = body.obj;
    if (obj === null || typeof obj !== "object") return null;

    const message = PAYMOB_HMAC_FIELDS.map((field) => read(obj, field)).join("");
    const expected = createHmac("sha512", this.cfg.hmacSecret).update(message).digest();
    const given = Buffer.from(supplied, "hex");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

    // These fields are covered by the signature; reject callbacks that are not for this merchant's EGP transactions.
    if (body.type !== "TRANSACTION") return null;
    if (read(obj, "currency") !== "EGP") return null;
    const integrationId = Number(read(obj, "integration_id"));
    if (this.cfg.integrationId !== undefined && integrationId !== this.cfg.integrationId) return null;
    if (this.cfg.paymentMethodIds && !this.cfg.paymentMethodIds.includes(integrationId)) return null;

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

  private async post<T>(path: string, body: unknown, extraHeaders: Record<string, string> = {}): Promise<T> {
    const res = await this.http(`${this.base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...extraHeaders },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Payment provider returned HTTP ${res.status} for ${path}`);
    return (await res.json()) as T;
  }
}
