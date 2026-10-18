export interface CheckoutRequest {
  readonly amountPiastres: number;
  /** Unique per attempt; echoed by the provider so we can reconcile. */
  readonly merchantOrderId: string;
  readonly customerPhone: string;
}

export interface Checkout {
  /** Provider-side identifier of the payment order; the key used to match webhooks. */
  readonly providerRef: string;
  readonly redirectUrl: string;
}

export interface WebhookEvent {
  readonly providerRef: string;
  readonly transactionId: string;
  readonly success: boolean;
  readonly pending: boolean;
  readonly refunded: boolean;
  readonly amountPiastres: number;
}

export interface PaymentGateway {
  readonly provider: "paymob";
  createCheckout(req: CheckoutRequest): Promise<Checkout>;
  /** Returns null when the signature does not verify; callers must treat that as an unauthenticated request. */
  verifyWebhook(req: { readonly rawBody: string; readonly query: Readonly<Record<string, string | undefined>> }): WebhookEvent | null;
}

export type SettleOutcome =
  | { readonly outcome: "paid" | "failed" | "refunded"; readonly trackingToken: string; readonly orderStatus: string }
  /** Money arrived for an order that is already paid or cancelled; recorded and audited so staff can refund it. */
  | { readonly outcome: "duplicate" | "unknown" | "amount_mismatch" | "ignored" | "needs_refund" };

export interface PaymentRepository {
  /** True when a checkout for this order was opened since `since` and is still awaiting a result. */
  hasRecentPending(orderId: number, since: Date): Promise<boolean>;
  recordPending(p: { orderId: number; provider: string; providerRef: string; amountPiastres: number }): Promise<void>;
  /** Applies a verified provider event exactly once (idempotent under replays and concurrent deliveries). */
  settle(provider: string, event: WebhookEvent, rawPayload: unknown): Promise<SettleOutcome>;
}
