import type { AuthDeps } from "../application/auth-ports";
import type { AdminRepository } from "../application/admin-ports";
import type {
  CatalogRepository,
  OrderEventPublisher,
  OrderEventSource,
  OrderRepository,
} from "../application/ports";
import type { PaymentGateway, PaymentRepository } from "../application/payment-ports";

export interface AppDeps {
  readonly catalog: CatalogRepository;
  readonly orders: OrderRepository;
  readonly events: OrderEventPublisher & OrderEventSource;
  readonly auth: AuthDeps;
  readonly admin: AdminRepository;
  /** Enabled only when a payment provider is configured; online orders are rejected otherwise. */
  readonly payments?: { readonly gateway: PaymentGateway; readonly repo: PaymentRepository };
  readonly newToken: () => string;
  readonly fingerprint: (value: unknown) => string;
  readonly now: () => Date;
  readonly logger?: boolean;
  /** Destination for structured logs (defaults to stdout); tests use it to assert on security events. */
  readonly logStream?: { write(message: string): void };
  readonly ordersPerMinute?: number;
  /** Number of trusted proxy hops in front of the API (0/undefined = none). Needed for correct per-client rate limits. */
  readonly trustProxyHops?: number;
  /** Exact browser origins allowed to call the API (e.g. a Flutter web build). Empty/undefined = same-origin only. */
  readonly allowedOrigins?: readonly string[];
  /** Directory of the static staff web app, served at /staff/. */
  readonly staffWebRoot?: string;
}
