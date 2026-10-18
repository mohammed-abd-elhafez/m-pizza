import { ApiError, createApi } from "./api.js";
import { clear, h, toast } from "./dom.js";
import { applyLanguage, lang, t, toggleLanguage } from "./i18n.js";
import { COLUMNS, describeHalf, elapsedLabel, formatMoney, newOrderIds, nextAction, urgency } from "./logic.js";

const POLL_MS = 5000;
const api = createApi();
if (!api.token) location.replace("./");

const board = document.getElementById("board");
const connection = document.getElementById("connection");
const soundButton = document.getElementById("sound");
const langButton = document.getElementById("lang");
const cancelDialog = document.getElementById("cancel-dialog");
const cancelForm = document.getElementById("cancel-form");
const cancelReason = document.getElementById("cancel-reason");

let orders = [];
let knownIds = null;
let audio = null;
let cancelling = null;
let online = true;

function leaveToLogin() {
  location.replace("./");
}

function beep() {
  if (!audio) return;
  const now = audio.currentTime;
  for (const [i, freq] of [880, 1175].entries()) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + i * 0.22);
    gain.gain.exponentialRampToValueAtTime(0.3, now + i * 0.22 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.22 + 0.2);
    osc.connect(gain).connect(audio.destination);
    osc.start(now + i * 0.22);
    osc.stop(now + i * 0.22 + 0.21);
  }
}

function setConnection(isOnline) {
  online = isOnline;
  connection.dataset.state = isOnline ? "online" : "offline";
  connection.textContent = t(isOnline ? "connected" : "offline");
}

function halfView(half, isHalfAndHalf) {
  return h(
    "span",
    { className: `half${isHalfAndHalf ? " half-and-half" : ""}` },
    isHalfAndHalf ? h("span", { className: "which" }, t(half.half), " ") : null,
    describeHalf(half),
  );
}

function lineView(line) {
  const isHalfAndHalf = line.halves.length === 2;
  return h(
    "div",
    { className: "line" },
    h("span", { className: "qty" }, `${line.qty}× `),
    line.crust ? h("span", { className: "tag" }, line.crust) : null,
    ...line.halves.map((half) => halfView(half, isHalfAndHalf)),
    line.note ? h("div", { className: "note" }, `${t("note")}: ${line.note}`) : null,
  );
}

function cardView(order) {
  const action = nextAction(order);
  const paidOnline = order.paymentMethod === "online";
  const buttons = [];
  if (action) {
    buttons.push(
      h("button", { className: "primary", dataset: { action: "next" }, onClick: (e) => move(order, action.to, e.currentTarget) }, t(action.labelKey)),
    );
  }
  buttons.push(
    h("button", { className: "danger", dataset: { action: "cancel" }, onClick: () => openCancel(order) }, t("cancel")),
  );

  return h(
    "article",
    { className: "card", dataset: { id: order.id, since: order.statusSince, status: order.status, urgency: urgency(order.status, order.statusSince, Date.now()) } },
    h(
      "header",
      null,
      h("span", { className: "id" }, `${t("order")} #${order.id}`),
      h("span", { className: "timer" }, elapsedLabel(order.statusSince, Date.now())),
    ),
    h(
      "div",
      { className: "tags" },
      h("span", { className: "tag" }, t(order.service)),
      h("span", { className: paidOnline ? "tag paid" : "tag" }, t(paidOnline ? "paid" : "cash")),
      h("span", { className: "tag" }, formatMoney(order.totalPiastres, lang)),
    ),
    ...order.lines.map(lineView),
    order.note ? h("div", { className: "note" }, `${t("note")}: ${order.note}`) : null,
    h("div", { className: "actions" }, ...buttons),
  );
}

function render() {
  clear(board);
  for (const status of COLUMNS) {
    const inColumn = orders.filter((o) => o.status === status);
    board.append(
      h(
        "section",
        { className: "column", dataset: { status } },
        h("h2", null, h("span", null, t(status)), h("span", { className: "count" }, inColumn.length)),
        ...inColumn.map(cardView),
      ),
    );
  }
}

function tickTimers() {
  const now = Date.now();
  for (const card of board.querySelectorAll(".card")) {
    card.querySelector(".timer").textContent = elapsedLabel(card.dataset.since, now);
    card.dataset.urgency = urgency(card.dataset.status, card.dataset.since, now);
  }
}

async function refresh() {
  try {
    const { orders: fresh } = await api.get("/kitchen/orders?limit=200");
    const ids = new Set(fresh.map((o) => o.id));
    if (newOrderIds(knownIds, fresh.map((o) => o.id)).length > 0) beep();
    knownIds = ids;
    orders = fresh;
    setConnection(true);
    render();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return leaveToLogin();
    setConnection(false);
  }
}

async function move(order, to, button, reason) {
  button.disabled = true;
  try {
    await api.post(`/kitchen/orders/${order.id}/transition`, reason ? { to, reason } : { to });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return leaveToLogin();
    const known = { ILLEGAL_TRANSITION: "refreshOrder", CONFLICT: "refreshOrder", PAYMENT_PENDING: "paymentPending" };
    toast(t(known[err.code] ?? "failed"), "error");
  } finally {
    // The cancel dialog's confirm button is reused across orders, so it must never stay disabled.
    button.disabled = false;
  }
  await refresh();
}

function openCancel(order) {
  cancelling = order;
  cancelReason.value = "";
  cancelDialog.showModal();
  cancelReason.focus();
}

document.getElementById("cancel-back").addEventListener("click", () => cancelDialog.close());
cancelForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const reason = cancelReason.value.trim();
  if (!reason || !cancelling) return;
  const order = cancelling;
  cancelling = null;
  cancelDialog.close();
  await move(order, "CANCELLED", document.getElementById("cancel-confirm"), reason);
});

soundButton.addEventListener("click", () => {
  audio ??= new AudioContext();
  void audio.resume();
  soundButton.textContent = t("soundOn");
  soundButton.disabled = true;
  beep();
});

langButton.addEventListener("click", () => {
  toggleLanguage();
  setup();
  render();
});

document.getElementById("signout").addEventListener("click", async () => {
  await api.logout();
  leaveToLogin();
});

function setup() {
  applyLanguage();
  langButton.textContent = lang === "ar" ? "English" : "العربية";
  if (audio) soundButton.textContent = t("soundOn");
  setConnection(online);
  document.getElementById("admin-link").hidden = api.role !== "admin";
}

setup();
render();
void refresh();
setInterval(refresh, POLL_MS);
setInterval(tickTimers, 1000);
