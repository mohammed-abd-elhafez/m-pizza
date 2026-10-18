import { describe, expect, it } from "vitest";
// @ts-expect-error plain JS module shipped to browsers; tested here without a DOM
import { ApiError, createApi } from "../../staff-web/public/js/api.js";
// @ts-expect-error plain JS module shipped to browsers; tested here without a DOM
import { COLUMNS, describeHalf, elapsedLabel, formatMoney, newOrderIds, nextAction, parsePounds, urgency } from "../../staff-web/public/js/logic.js";

describe("formatMoney", () => {
  it("shows pounds from piastres in both languages", () => {
    expect(formatMoney(8500, "ar")).toBe("85 ج.م");
    expect(formatMoney(8550, "en")).toBe("85.50 EGP");
    expect(formatMoney(5, "en")).toBe("0.05 EGP");
    expect(formatMoney(Number.NaN, "en")).toBe("-");
  });
});

describe("parsePounds", () => {
  it("parses typed amounts, including Arabic digits and decimal separators, into integer piastres", () => {
    expect(parsePounds("85")).toBe(8500);
    expect(parsePounds(" 85.5 ")).toBe(8550);
    expect(parsePounds("٨٥,٥")).toBe(8550);
    expect(parsePounds("٨٥٫٢٥")).toBe(8525);
    expect(parsePounds("0.1")).toBe(10);
    expect(parsePounds("19.99")).toBe(1999);
  });
  it("rejects anything else", () => {
    for (const bad of ["", "abc", "-5", "1e3", "1.234", "1,2,3", "9999999", "12.", ".5"]) expect(parsePounds(bad)).toBeNull();
  });
});

describe("nextAction", () => {
  it("walks the delivery path and the pickup path", () => {
    const delivery = ["PLACED", "ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY"].map((status) => nextAction({ status, service: "delivery" })?.to);
    expect(delivery).toEqual(["ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED"]);
    expect(nextAction({ status: "READY", service: "pickup" })?.to).toBe("PICKED_UP");
  });
  it("offers nothing for finished orders", () => {
    for (const status of ["DELIVERED", "PICKED_UP", "CANCELLED"]) expect(nextAction({ status, service: "delivery" })).toBeNull();
  });
  it("covers every board column", () => {
    for (const status of COLUMNS) expect(nextAction({ status, service: "delivery" })).not.toBeNull();
  });
});

describe("elapsedLabel and urgency", () => {
  const now = Date.parse("2026-10-18T12:10:00Z");
  it("formats elapsed time", () => {
    expect(elapsedLabel("2026-10-18T12:09:55Z", now)).toBe("0:05");
    expect(elapsedLabel("2026-10-18T12:00:00Z", now)).toBe("10:00");
    expect(elapsedLabel("2026-10-18T10:55:30Z", now)).toBe("1:14:30");
    expect(elapsedLabel("2026-10-18T13:00:00Z", now)).toBe("0:00"); // clock skew never goes negative
    expect(elapsedLabel("garbage", now)).toBe("--:--");
  });
  it("escalates as an order waits", () => {
    expect(urgency("PLACED", "2026-10-18T12:09:00Z", now)).toBe("ok");
    expect(urgency("PLACED", "2026-10-18T12:07:00Z", now)).toBe("warn");
    expect(urgency("PLACED", "2026-10-18T12:00:00Z", now)).toBe("late");
    expect(urgency("PREPARING", "2026-10-18T12:00:00Z", now)).toBe("ok"); // 10 min is still within the limit
    expect(urgency("PREPARING", "2026-10-18T11:55:00Z", now)).toBe("warn");
    expect(urgency("PREPARING", "2026-10-18T11:45:00Z", now)).toBe("late");
    expect(urgency("UNKNOWN", "2026-10-18T10:00:00Z", now)).toBe("ok");
    expect(urgency("PLACED", "garbage", now)).toBe("ok");
  });
});

describe("newOrderIds", () => {
  it("never beeps on the first load, then reports only unseen ids", () => {
    expect(newOrderIds(null, [1, 2])).toEqual([]);
    expect(newOrderIds(new Set([1, 2]), [1, 2, 3, 4])).toEqual([3, 4]);
    expect(newOrderIds(new Set([1, 2]), [2])).toEqual([]);
  });
});

describe("describeHalf", () => {
  it("shows size and topping changes", () => {
    expect(describeHalf({ item: "Pepperoni", size: "M", toppings: [{ name: "Cheese", action: "add" }, { name: "Olives", action: "remove" }] })).toBe(
      "Pepperoni (M) +Cheese -Olives",
    );
    expect(describeHalf({ item: "Margherita", size: "L", toppings: [] })).toBe("Margherita (L)");
  });
});

describe("staff api client", () => {
  const store = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  };
  const reply = (status: number, body: unknown) => ({ status, ok: status < 400, json: async () => body });

  it("logs in, remembers the token and sends it as a bearer header", async () => {
    const calls: { path: string; init: { headers: Record<string, string> } }[] = [];
    const fetchFn = async (path: string, init: { headers: Record<string, string> }) => {
      calls.push({ path, init });
      return path === "/staff/login" ? reply(200, { token: "abc", role: "kitchen" }) : reply(200, { orders: [] });
    };
    const api = createApi(store(), fetchFn);
    expect(api.token).toBeNull();
    await api.login("amira", "secret password");
    expect([api.token, api.role]).toEqual(["abc", "kitchen"]);
    await api.get("/kitchen/orders");
    expect(calls[1]!.init.headers["authorization"]).toBe("Bearer abc");
    expect(calls[0]!.init.headers["authorization"]).toBeUndefined();
  });

  it("turns error responses into ApiError carrying the server code", async () => {
    const api = createApi(store(), async () => reply(409, { error: { code: "ILLEGAL_TRANSITION", message: "no" } }));
    const err = await api.post("/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect([(err as InstanceType<typeof ApiError>).status, (err as InstanceType<typeof ApiError>).code]).toEqual([409, "ILLEGAL_TRANSITION"]);
  });

  it("reports network failures and handles 204", async () => {
    const down = createApi(store(), async () => {
      throw new TypeError("failed to fetch");
    });
    await expect(down.get("/x")).rejects.toMatchObject({ code: "NETWORK", status: 0 });
    const empty = createApi(store(), async () => ({ status: 204, ok: true, json: async () => ({}) }));
    expect(await empty.delete("/x")).toBeNull();
  });

  it("logout clears the local session even when the server call fails", async () => {
    const api = createApi(store(), async (path: string) => (path === "/staff/login" ? reply(200, { token: "t", role: "admin" }) : Promise.reject(new Error("down"))));
    await api.login("hassan", "admin password");
    await api.logout();
    expect(api.token).toBeNull();
    expect(api.role).toBeNull();
  });
});
