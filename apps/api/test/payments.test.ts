import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AppError } from "../src/application/errors";
import type { PaymentGateway, PaymentRepository, SettleOutcome, WebhookEvent } from "../src/application/payment-ports";
import { handlePaymentWebhook, startCheckout } from "../src/application/payments";
import { PAYMOB_HMAC_FIELDS, PaymobGateway } from "../src/infra/paymob";
import { RecordingEvents } from "./support/fakes";

class FakeGateway implements PaymentGateway {
  readonly provider = "paymob" as const;
  created: { amountPiastres: number; merchantOrderId: string; customerPhone: string }[] = [];
  async createCheckout(req: { amountPiastres: number; merchantOrderId: string; customerPhone: string }) {
    this.created.push(req);
    return { providerRef: `pm-${this.created.length}`, redirectUrl: `https://pay.example/${this.created.length}` };
  }
  verifyWebhook(req: { rawBody: string; query: Readonly<Record<string, string | undefined>> }): WebhookEvent | null {
    return req.query["sig"] === "ok" ? (JSON.parse(req.rawBody) as WebhookEvent) : null;
  }
}

class FakePayments implements PaymentRepository {
  pending: { orderId: number; provider: string; providerRef: string; amountPiastres: number }[] = [];
  next: SettleOutcome = { outcome: "unknown" };
  settled: WebhookEvent[] = [];
  async recordPending(p: { orderId: number; provider: string; providerRef: string; amountPiastres: number }) {
    this.pending.push(p);
  }
  async hasRecentPending() {
    return false;
  }
  async settle(_provider: string, event: WebhookEvent) {
    this.settled.push(event);
    return this.next;
  }
}

const event: WebhookEvent = { providerRef: "pm-1", transactionId: "t1", success: true, pending: false, refunded: false, amountPiastres: 20500 };

describe("startCheckout", () => {
  it("opens a hosted checkout for the exact order total and records it as pending", async () => {
    const gateway = new FakeGateway();
    const repo = new FakePayments();
    const out = await startCheckout({ gateway, repo }, { id: 7, totalPiastres: 20500, phone: "+201012345678" }, "a1");
    expect(out.redirectUrl).toBe("https://pay.example/1");
    expect(gateway.created[0]).toEqual({ amountPiastres: 20500, merchantOrderId: "m7-a1", customerPhone: "+201012345678" });
    expect(repo.pending).toEqual([{ orderId: 7, provider: "paymob", providerRef: "pm-1", amountPiastres: 20500 }]);
  });

  it("records nothing when the provider fails", async () => {
    const gateway = new FakeGateway();
    gateway.createCheckout = async () => {
      throw new Error("provider down");
    };
    const repo = new FakePayments();
    await expect(startCheckout({ gateway, repo }, { id: 1, totalPiastres: 100, phone: "+201012345678" }, "x")).rejects.toThrow();
    expect(repo.pending).toHaveLength(0);
  });
});

describe("handlePaymentWebhook", () => {
  const body = JSON.stringify(event);

  it("rejects a bad signature without touching any state", async () => {
    const repo = new FakePayments();
    const events = new RecordingEvents();
    const err = await handlePaymentWebhook({ gateway: new FakeGateway(), repo, events }, { rawBody: body, query: { sig: "forged" } }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe("UNAUTHORIZED");
    expect(repo.settled).toHaveLength(0);
    expect(events.published).toHaveLength(0);
  });

  it("publishes a live update only when the order really changed", async () => {
    const repo = new FakePayments();
    const events = new RecordingEvents();
    const deps = { gateway: new FakeGateway(), repo, events };

    repo.next = { outcome: "paid", trackingToken: "tok-1", orderStatus: "PLACED" };
    expect(await handlePaymentWebhook(deps, { rawBody: body, query: { sig: "ok" } })).toEqual({ outcome: "paid" });
    expect(events.published).toEqual([{ trackingToken: "tok-1", status: "PLACED", paymentStatus: "PAID" }]);

    for (const outcome of ["duplicate", "unknown", "amount_mismatch", "ignored"] as const) {
      repo.next = { outcome };
      await handlePaymentWebhook(deps, { rawBody: body, query: { sig: "ok" } });
    }
    expect(events.published).toHaveLength(1);
  });
});

describe("PaymobGateway.verifyWebhook", () => {
  const SECRET = "hmac-secret-for-tests";
  const gateway = new PaymobGateway({ apiKey: "k", integrationId: 1, iframeId: 2, hmacSecret: SECRET });

  const obj = {
    amount_cents: 20500, created_at: "2026-10-18T12:00:00.000000", currency: "EGP", error_occured: false,
    has_parent_transaction: false, id: 555, integration_id: 1, is_3d_secure: true, is_auth: false, is_capture: false,
    is_refunded: false, is_standalone_payment: true, is_voided: false, order: { id: 999 }, owner: 12, pending: false,
    source_data: { pan: "2346", sub_type: "MasterCard", type: "card" }, success: true,
  };
  const raw = JSON.stringify({ type: "TRANSACTION", obj });
  const sign = (o: unknown, secret = SECRET) =>
    createHmac("sha512", secret)
      .update(
        PAYMOB_HMAC_FIELDS.map((f) => {
          let cur: unknown = o;
          for (const p of f.split(".")) cur = (cur as Record<string, unknown> | undefined)?.[p];
          return cur === undefined || cur === null ? "" : String(cur);
        }).join(""),
      )
      .digest("hex");

  it("accepts a correctly signed callback and normalises it", () => {
    expect(gateway.verifyWebhook({ rawBody: raw, query: { hmac: sign(obj) } })).toEqual({
      providerRef: "999", transactionId: "555", success: true, pending: false, refunded: false, amountPiastres: 20500,
    });
  });

  it("rejects missing, wrong-secret, tampered and malformed callbacks", () => {
    expect(gateway.verifyWebhook({ rawBody: raw, query: {} })).toBeNull();
    expect(gateway.verifyWebhook({ rawBody: raw, query: { hmac: sign(obj, "other-secret") } })).toBeNull();
    const tampered = JSON.stringify({ type: "TRANSACTION", obj: { ...obj, amount_cents: 100 } });
    expect(gateway.verifyWebhook({ rawBody: tampered, query: { hmac: sign(obj) } })).toBeNull();
    expect(gateway.verifyWebhook({ rawBody: "{nope", query: { hmac: "00" } })).toBeNull();
    expect(gateway.verifyWebhook({ rawBody: raw, query: { hmac: "zz" } })).toBeNull();
  });

  it("treats only full refunds and voids as refunded; a partial refund is not", () => {
    const check = (o: unknown) => gateway.verifyWebhook({ rawBody: JSON.stringify({ type: "TRANSACTION", obj: o }), query: { hmac: sign(o) } });
    expect(check({ ...obj, is_refunded: true, refunded_amount_cents: 20500 })?.refunded).toBe(true);
    expect(check({ ...obj, is_refunded: true, refunded_amount_cents: 5000 })?.refunded).toBe(false);
    expect(check({ ...obj, is_refunded: true })?.refunded).toBe(false); // amount unknown: do not assume a full refund
    expect(check({ ...obj, is_voided: true })?.refunded).toBe(true);
  });

  it("rejects correctly signed callbacks that are not this merchant's EGP transactions", () => {
    const send = (o: unknown, type = "TRANSACTION") => gateway.verifyWebhook({ rawBody: JSON.stringify({ type, obj: o }), query: { hmac: sign(o) } });
    expect(send(obj)).not.toBeNull();
    expect(send({ ...obj, currency: "USD" })).toBeNull();
    expect(send({ ...obj, integration_id: 999 })).toBeNull();
    expect(send(obj, "TOKEN")).toBeNull();
  });
});

describe("PaymobGateway.createCheckout", () => {
  it("runs auth, order registration and payment key requests and builds the iframe URL", async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const fakeFetch = (async (url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as Record<string, unknown>;
      calls.push({ url, body });
      const json = url.endsWith("/tokens") ? { token: "auth-t" } : url.endsWith("/orders") ? { id: 321 } : { token: "pay-t" };
      return { ok: true, status: 200, json: async () => json };
    }) as unknown as typeof fetch;

    const gw = new PaymobGateway({ apiKey: "KEY", integrationId: 11, iframeId: 22, hmacSecret: "s", baseUrl: "https://p.test", fetch: fakeFetch });
    const out = await gw.createCheckout({ amountPiastres: 20500, merchantOrderId: "m1-a", customerPhone: "+201012345678" });

    expect(calls.map((c) => new URL(c.url).pathname)).toEqual(["/api/auth/tokens", "/api/ecommerce/orders", "/api/acceptance/payment_keys"]);
    expect(calls[1]!.body).toMatchObject({ amount_cents: 20500, currency: "EGP", merchant_order_id: "m1-a", auth_token: "auth-t" });
    expect(calls[2]!.body).toMatchObject({ order_id: 321, integration_id: 11, amount_cents: 20500 });
    expect(out).toEqual({ providerRef: "321", redirectUrl: "https://p.test/api/acceptance/iframes/22?payment_token=pay-t" });
  });

  it("fails loudly on a provider error", async () => {
    const failing = (async () => ({ ok: false, status: 502, json: async () => ({}) })) as unknown as typeof fetch;
    const gw = new PaymobGateway({ apiKey: "K", integrationId: 1, iframeId: 2, hmacSecret: "s", fetch: failing });
    await expect(gw.createCheckout({ amountPiastres: 1, merchantOrderId: "m", customerPhone: "+201012345678" })).rejects.toThrow(/HTTP 502/);
  });

  it("uses the current Intention API and builds a Unified Checkout URL", async () => {
    const calls: { url: string; body: Record<string, unknown>; headers: Record<string, string> }[] = [];
    const fakeFetch = (async (url: string, init: { body: string; headers: Record<string, string> }) => {
      calls.push({ url, body: JSON.parse(init.body) as Record<string, unknown>, headers: init.headers });
      return {
        ok: true,
        status: 201,
        json: async () => ({ id: 77, intention_order_id: 321, client_secret: "csk_test_once" }),
      };
    }) as unknown as typeof fetch;

    const gw = new PaymobGateway({
      mode: "intention",
      secretKey: "sk_test_key",
      publicKey: "pk_test_key",
      paymentMethodIds: [11, 12],
      hmacSecret: "h",
      notificationUrl: "https://api.example.com/payments/webhook/paymob",
      redirectionUrl: "https://app.example.com/payment-result",
      baseUrl: "https://accept.test",
      fetch: fakeFetch,
    });
    const out = await gw.createCheckout({ amountPiastres: 20500, merchantOrderId: "m7-a", customerPhone: "+201012345678" });

    expect(calls).toHaveLength(1);
    expect(new URL(calls[0]!.url).pathname).toBe("/v1/intention/");
    expect(calls[0]!.headers.Authorization).toBe("Token sk_test_key");
    expect(calls[0]!.body).toMatchObject({
      amount: 20500,
      currency: "EGP",
      payment_methods: [11, 12],
      special_reference: "m7-a",
      notification_url: "https://api.example.com/payments/webhook/paymob",
    });
    expect(out).toEqual({
      providerRef: "321",
      redirectUrl: "https://accept.test/unifiedcheckout/?publicKey=pk_test_key&clientSecret=csk_test_once",
    });
  });
});
