import type {
  AuthDeps,
  Customer,
  CustomerRepository,
  OtpRepository,
  SessionRepository,
  StaffAccount,
  StaffRepository,
  SubjectType,
} from "../../src/application/auth-ports";
import type {
  CatalogRepository,
  CreateOrderResult,
  DeliveryNetwork,
  KitchenListOptions,
  KitchenOrderView,
  MenuView,
  NewOrder,
  OrderEventPublisher,
  OrderEventSource,
  OrderForTransition,
  OrderHistoryEntry,
  OrderRepository,
  OrderStatusEvent,
  OrderView,
  PaymentStatus,
  PlacedOrder,
} from "../../src/application/ports";
import type { OrderEvent, OrderStatus } from "../../src/domain/order-state-machine";
import type { Catalog } from "../../src/domain/pricing";
import type { StaffRole } from "../../src/domain/policy";
import { NodeSecretService } from "../../src/infra/crypto";
import { InMemoryOrderEvents } from "../../src/infra/event-bus";
import { CapturingOtpSender } from "../../src/infra/otp-senders";

export const OTP_SECRET = "test-otp-secret-0123456789-abcdefghij";

export const catalog: Catalog = {
  items: {
    1: { id: 1, kind: "pizza", available: true },
    2: { id: 2, kind: "pizza", available: true },
    3: { id: 3, kind: "drink", available: true },
  },
  sizes: {
    10: { itemId: 1, label: "S", price: 15000 },
    11: { itemId: 1, label: "L", price: 20000 },
    20: { itemId: 2, label: "S", price: 17000 },
    30: { itemId: 3, label: "330ml", price: 2500 },
  },
  crusts: { 1: 0, 2: 2000 },
  toppings: { 1: { delta: 1500, available: true }, 2: { delta: 1000, available: true } },
};

// ~0.009 deg of latitude is ~1 km
export const BRANCH = { lat: 30.0444, lng: 31.2357 };
export const near = { lat: BRANCH.lat + 0.009, lng: BRANCH.lng };
export const far = { lat: BRANCH.lat + 1, lng: BRANCH.lng };

export const network: DeliveryNetwork = {
  branches: [
    { id: 1, ...BRANCH, isOpen: true },
    { id: 2, ...BRANCH, isOpen: false },
  ],
  zones: [
    { id: 1, branchId: 1, name: "near", radiusM: 3000, feePiastres: 2000, minOrderPiastres: 10000, etaMinutes: 30 },
  ],
};

export const emptyMenu: MenuView = { categories: [], crusts: [], toppings: [] };

export class FakeCatalogRepo implements CatalogRepository {
  loadCatalog = async () => catalog;
  loadDeliveryNetwork = async () => network;
  loadMenu = async () => emptyMenu;
}

export class Clock {
  constructor(private ms = Date.parse("2026-10-18T12:00:00Z")) {}
  now = (): Date => new Date(this.ms);
  advance(deltaMs: number): void {
    this.ms += deltaMs;
  }
}

interface Stored {
  readonly id: number;
  readonly order: NewOrder;
  readonly createdAt: Date;
  readonly branchId: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  readonly events: OrderEvent[];
}

export class FakeOrderRepo implements OrderRepository {
  readonly stored = new Map<number, Stored>();
  private nextId = 1;

  constructor(
    private readonly clock: Clock = new Clock(),
    private readonly customerIdOfPhone: (phone: string) => number | undefined = () => undefined,
  ) {}

  async create(order: NewOrder, window: { since: Date; max: number }): Promise<CreateOrderResult> {
    const existing = this.byKey(order.phone, order.idempotencyKey);
    if (existing) {
      return order.requestHash === existing.order.requestHash
        ? { outcome: "replayed", order: this.placed(existing) }
        : { outcome: "key_conflict" };
    }
    // Counted directly (not through countSince) so the check stays independent of the caller's early check.
    const recent = [...this.stored.values()].filter((s) => s.order.phone === order.phone && s.createdAt >= window.since).length;
    if (recent >= window.max) return { outcome: "rate_limited" };
    const id = this.nextId++;
    const s: Stored = {
      id,
      order,
      createdAt: this.clock.now(),
      branchId: order.branchId,
      status: "PLACED",
      paymentStatus: order.paymentMethod === "cod" ? "COD_PENDING" : "UNPAID",
      events: [],
    };
    this.stored.set(id, s);
    return { outcome: "created", order: this.placed(s) };
  }

  async findByIdempotencyKey(phone: string, key: string) {
    const s = this.byKey(phone, key);
    return s ? { order: this.placed(s), requestHash: s.order.requestHash } : null;
  }

  async countSince(phone: string, since: Date): Promise<number> {
    return [...this.stored.values()].filter((s) => s.order.phone === phone && s.createdAt >= since).length;
  }

  async findByToken(token: string): Promise<OrderView | null> {
    for (const s of this.stored.values()) {
      if (s.order.trackingToken === token) {
        return {
          ...this.placed(s),
          service: s.order.service,
          subtotalPiastres: s.order.subtotalPiastres,
          deliveryFeePiastres: s.order.deliveryFeePiastres,
          branchPhone: null,
          createdAt: s.createdAt.toISOString(),
        };
      }
    }
    return null;
  }

  async findByTokenForCustomer(token: string, customerId: number): Promise<OrderView | null> {
    const s = [...this.stored.values()].find((x) => x.order.trackingToken === token);
    return s && this.customerIdOfPhone(s.order.phone) === customerId ? this.findByToken(token) : null;
  }

  async listExpiredUnpaid(before: Date, limit: number): Promise<readonly number[]> {
    return [...this.stored.values()]
      .filter((s) => s.order.paymentMethod === "online" && s.paymentStatus === "UNPAID" && s.status === "PLACED" && s.createdAt < before)
      .slice(0, limit)
      .map((s) => s.id);
  }

  async findForTransition(id: number): Promise<OrderForTransition | null> {
    const s = this.stored.get(id);
    return s
      ? {
          id,
          branchId: s.branchId,
          trackingToken: s.order.trackingToken,
          status: s.status,
          service: s.order.service,
          paymentMethod: s.order.paymentMethod,
          paymentStatus: s.paymentStatus,
        }
      : null;
  }

  async applyTransition(args: { orderId: number; event: OrderEvent; paymentStatus?: PaymentStatus }): Promise<boolean> {
    const s = this.stored.get(args.orderId);
    if (!s || s.status !== args.event.from) return false;
    s.status = args.event.to;
    if (args.paymentStatus) s.paymentStatus = args.paymentStatus;
    s.events.push(args.event);
    return true;
  }

  async listByStatuses(statuses: readonly OrderStatus[], options: KitchenListOptions): Promise<readonly KitchenOrderView[]> {
    return [...this.stored.values()]
      .filter((s) => statuses.includes(s.status))
      .filter((s) => options.branchId === undefined || s.branchId === options.branchId)
      .filter((s) => s.order.paymentMethod === "cod" || s.paymentStatus === "PAID" || s.status === "CANCELLED")
      .slice(0, options.limit)
      .map((s) => ({
        id: s.id,
        status: s.status,
        service: s.order.service,
        paymentMethod: s.order.paymentMethod,
        paymentStatus: s.paymentStatus,
        totalPiastres: s.order.totalPiastres,
        note: s.order.note,
        statusSince: s.createdAt.toISOString(),
        lines: [],
      }));
  }

  async listForCustomer(customerId: number, limit: number): Promise<readonly OrderHistoryEntry[]> {
    return [...this.stored.values()]
      .filter((s) => this.customerIdOfPhone(s.order.phone) === customerId)
      .reverse()
      .slice(0, limit)
      .map((s) => ({
        trackingToken: s.order.trackingToken,
        status: s.status,
        paymentStatus: s.paymentStatus,
        service: s.order.service,
        totalPiastres: s.order.totalPiastres,
        createdAt: s.createdAt.toISOString(),
        lines: s.order.lines.map((l) => ({
          qty: l.qty,
          crustId: l.crustId,
          note: l.note,
          halves: l.halves.map((h) => ({
            half: h.half,
            itemId: h.itemId,
            sizeId: h.sizeId,
            toppings: h.toppings.map((t) => ({ id: t.id, action: t.action })),
          })),
        })),
      }));
  }

  private byKey(phone: string, key: string): Stored | undefined {
    return [...this.stored.values()].find((s) => s.order.phone === phone && s.order.idempotencyKey === key);
  }

  private placed(s: Stored): PlacedOrder {
    return {
      id: s.id,
      trackingToken: s.order.trackingToken,
      status: s.status,
      paymentStatus: s.paymentStatus,
      totalPiastres: s.order.totalPiastres,
    };
  }
}

export class RecordingEvents implements OrderEventPublisher, OrderEventSource {
  readonly published: OrderStatusEvent[] = [];
  private readonly bus = new InMemoryOrderEvents();
  publish(event: OrderStatusEvent): void {
    this.published.push(event);
    this.bus.publish(event);
  }
  subscribe = (token: string, listener: (e: OrderStatusEvent) => void) => this.bus.subscribe(token, listener);
}

// ---- authentication fakes -------------------------------------------------------------------------------

class MemoryOtps implements OtpRepository {
  rows: { id: number; phone: string; codeDigest: string; attempts: number; expiresAt: Date; consumedAt: Date | null; createdAt: Date }[] = [];
  constructor(private readonly clock: Clock) {}
  async createIfUnderLimit(otp: { phone: string; codeDigest: string; expiresAt: Date }, since: Date, max: number) {
    if (this.rows.filter((r) => r.phone === otp.phone && r.createdAt >= since).length >= max) return false;
    this.rows.push({ id: this.rows.length + 1, ...otp, attempts: 0, consumedAt: null, createdAt: this.clock.now() });
    return true;
  }
  async failedAttemptsSince(phone: string, since: Date) {
    return this.rows.filter((r) => r.phone === phone && r.createdAt >= since && !r.consumedAt).reduce((n, r) => n + r.attempts, 0);
  }
  async findActive(phone: string, now: Date) {
    const r = [...this.rows].reverse().find((x) => x.phone === phone && !x.consumedAt && x.expiresAt > now);
    return r ? { id: r.id, codeDigest: r.codeDigest } : null;
  }
  async claimAttempt(id: number, max: number) {
    const r = this.rows.find((x) => x.id === id);
    if (!r || r.attempts >= max || r.consumedAt) return false;
    r.attempts += 1;
    return true;
  }
  async consume(id: number, now: Date) {
    const r = this.rows.find((x) => x.id === id);
    if (!r || r.consumedAt) return false;
    r.consumedAt = now;
    return true;
  }
}

class MemorySessions implements SessionRepository {
  rows = new Map<string, { subjectType: SubjectType; subjectId: number; expiresAt: Date; revoked: boolean }>();
  async create(s: { tokenHash: string; subjectType: SubjectType; subjectId: number; expiresAt: Date }) {
    this.rows.set(s.tokenHash, { subjectType: s.subjectType, subjectId: s.subjectId, expiresAt: s.expiresAt, revoked: false });
  }
  async find(tokenHash: string, now: Date) {
    const r = this.rows.get(tokenHash);
    return r && !r.revoked && r.expiresAt > now ? { subjectType: r.subjectType, subjectId: r.subjectId } : null;
  }
  async revoke(tokenHash: string) {
    const r = this.rows.get(tokenHash);
    if (r) r.revoked = true;
  }
}

class MemoryCustomers implements CustomerRepository {
  rows: Customer[] = [];
  async upsertByPhone(phone: string) {
    return this.rows.find((c) => c.phone === phone) ?? this.add(phone);
  }
  async findById(id: number) {
    return this.rows.find((c) => c.id === id) ?? null;
  }
  idOf = (phone: string) => this.rows.find((c) => c.phone === phone)?.id;
  private add(phone: string): Customer {
    const c = { id: this.rows.length + 1, phone };
    this.rows.push(c);
    return c;
  }
}

class MemoryStaff implements StaffRepository {
  rows: StaffAccount[] = [];
  failures: { username: string; at: Date }[] = [];
  async recordLoginFailure(username: string, at: Date) {
    this.failures.push({ username, at });
  }
  async countLoginFailures(username: string, since: Date) {
    return this.failures.filter((f) => f.username === username && f.at >= since).length;
  }
  async findByUsername(username: string) {
    return this.rows.find((s) => s.username === username) ?? null;
  }
  async findById(id: number) {
    return this.rows.find((s) => s.id === id) ?? null;
  }
}

export interface TestAuth {
  readonly deps: AuthDeps;
  readonly sender: CapturingOtpSender;
  readonly clock: Clock;
  readonly sessions: MemorySessions;
  readonly otps: MemoryOtps;
  readonly customers: MemoryCustomers;
  addStaff(username: string, password: string, role: StaffRole, branchId?: number | null, isActive?: boolean): Promise<void>;
}

export function makeAuth(clock: Clock = new Clock()): TestAuth {
  const secrets = new NodeSecretService(OTP_SECRET);
  const otps = new MemoryOtps(clock);
  const sessions = new MemorySessions();
  const customers = new MemoryCustomers();
  const staff = new MemoryStaff();
  const sender = new CapturingOtpSender();
  return {
    deps: { secrets, otps, sessions, customers, staff, sender, now: clock.now },
    sender,
    clock,
    sessions,
    otps,
    customers,
    async addStaff(username, password, role, branchId = null, isActive = true) {
      staff.rows.push({
        id: staff.rows.length + 1,
        username,
        passwordHash: await secrets.hashPassword(password),
        role,
        branchId,
        isActive,
      });
    },
  };
}
