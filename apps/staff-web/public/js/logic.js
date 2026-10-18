// Pure helpers shared by the kitchen and admin pages. No DOM access, so they can be unit-tested.

/** Kitchen board columns in order. */
export const COLUMNS = ["PLACED", "ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY"];

/**
 * Formats integer piastres as a money string.
 * @param {number} piastres
 * @param {"ar" | "en"} lang
 */
export function formatMoney(piastres, lang = "ar") {
  if (!Number.isFinite(piastres)) return "-";
  const pounds = piastres / 100;
  const text = Number.isInteger(pounds) ? String(pounds) : pounds.toFixed(2);
  return lang === "ar" ? `${text} ج.م` : `${text} EGP`;
}

/**
 * Parses a pounds string typed by a person ("85", "85.5", "٨٥,٥") into integer piastres, or null if invalid.
 * @param {string} input
 */
export function parsePounds(input) {
  const western = String(input)
    .trim()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace("٫", ".")
    .replace(",", ".");
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(western)) return null;
  return Math.round(Number(western) * 100);
}

/**
 * The single "next step" button for an order, depending on its service type.
 * @param {{ status: string, service: string }} order
 * @returns {{ to: string, labelKey: string } | null}
 */
export function nextAction(order) {
  switch (order.status) {
    case "PLACED":
      return { to: "ACCEPTED", labelKey: "accept" };
    case "ACCEPTED":
      return { to: "PREPARING", labelKey: "startPreparing" };
    case "PREPARING":
      return { to: "READY", labelKey: "markReady" };
    case "READY":
      return order.service === "pickup"
        ? { to: "PICKED_UP", labelKey: "handToCustomer" }
        : { to: "OUT_FOR_DELIVERY", labelKey: "handToCourier" };
    case "OUT_FOR_DELIVERY":
      return { to: "DELIVERED", labelKey: "markDelivered" };
    default:
      return null;
  }
}

/** Orders in the READY column that are pickups wait for the customer; everything else follows its own status. */
export function columnOf(order) {
  return COLUMNS.includes(order.status) ? order.status : null;
}

/**
 * Elapsed time as m:ss (or h:mm:ss) since an ISO timestamp.
 * @param {string} sinceIso
 * @param {number} nowMs
 */
export function elapsedLabel(sinceIso, nowMs) {
  const since = Date.parse(sinceIso);
  if (Number.isNaN(since)) return "--:--";
  const total = Math.max(0, Math.floor((nowMs - since) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/**
 * How urgent an order looks, from how long it has been in its current status.
 * @param {string} status
 * @param {string} sinceIso
 * @param {number} nowMs
 * @returns {"ok" | "warn" | "late"}
 */
export function urgency(status, sinceIso, nowMs) {
  const minutes = (nowMs - Date.parse(sinceIso)) / 60000;
  if (Number.isNaN(minutes)) return "ok";
  const limits = { PLACED: [2, 5], ACCEPTED: [5, 10], PREPARING: [12, 20], READY: [5, 10], OUT_FOR_DELIVERY: [25, 40] };
  const [warn, late] = limits[status] ?? [Infinity, Infinity];
  return minutes >= late ? "late" : minutes >= warn ? "warn" : "ok";
}

/** Ids that appeared since the last poll (used to beep for new orders, never on the first load). */
export function newOrderIds(previous, current) {
  if (previous === null) return [];
  return current.filter((id) => !previous.has(id));
}

/**
 * Human-readable summary of what a half contains, e.g. "Pepperoni (M) +cheese -olives".
 * @param {{ item: string, size: string, toppings: { name: string, action: string }[] }} half
 */
export function describeHalf(half) {
  const extras = half.toppings.map((t) => `${t.action === "add" ? "+" : "-"}${t.name}`).join(" ");
  return `${half.item} (${half.size})${extras ? ` ${extras}` : ""}`;
}
