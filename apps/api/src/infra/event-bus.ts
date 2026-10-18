import type { OrderEventPublisher, OrderStatusEvent } from "../application/ports";

type Listener = (event: OrderStatusEvent) => void;

/** In-process pub/sub keyed by tracking token. Single-instance only; swap for Postgres LISTEN/NOTIFY or Redis to scale out. */
export class InMemoryOrderEvents implements OrderEventPublisher {
  private readonly listeners = new Map<string, Set<Listener>>();

  publish(event: OrderStatusEvent): void {
    for (const listener of this.listeners.get(event.trackingToken) ?? []) {
      try {
        listener(event);
      } catch {
        // A broken subscriber must never affect the order flow.
      }
    }
  }

  subscribe(trackingToken: string, listener: Listener): () => void {
    const set = this.listeners.get(trackingToken) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(trackingToken, set);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(trackingToken);
    };
  }

  get subscriberCount(): number {
    let n = 0;
    for (const set of this.listeners.values()) n += set.size;
    return n;
  }
}
