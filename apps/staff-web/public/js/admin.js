import { ApiError, createApi } from "./api.js";
import { clear, h, toast } from "./dom.js";
import { applyLanguage, lang, t, toggleLanguage } from "./i18n.js";
import { formatMoney, parsePounds } from "./logic.js";

const api = createApi();
if (!api.token) location.replace("./");
else if (api.role !== "admin") location.replace("kitchen.html");

const content = document.getElementById("content");
const tabsEl = document.getElementById("tabs");
const langButton = document.getElementById("lang");

const TABS = [
  ["orders", "orders", renderOrders],
  ["menu", "menu", renderMenu],
  ["toppings", "toppings", renderToppings],
  ["crusts", "crusts", renderCrusts],
  ["zones", "zones", renderZones],
  ["branches", "branches", renderBranches],
];
let current = "orders";

const money = (piastres) => formatMoney(piastres, lang);
const cairoToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });

function fail(err) {
  if (err instanceof ApiError && err.status === 401) return location.replace("./");
  toast(err instanceof ApiError && err.message ? err.message : t("failed"), "error");
}

/** Runs `work`, reporting any error, and returns whether it succeeded. */
async function attempt(work, successMessage = "saved") {
  try {
    await work();
    toast(t(successMessage));
    return true;
  } catch (err) {
    fail(err);
    return false;
  }
}

/** A text input holding a price in pounds, with a save button that sends integer piastres. */
function priceEditor(piastres, save) {
  const input = h("input", { type: "text", inputmode: "decimal", value: String(piastres / 100), "aria-label": t("price") });
  const button = h(
    "button",
    {
      onClick: async () => {
        const value = parsePounds(input.value);
        if (value === null) return toast(t("invalidNumber"), "error");
        button.disabled = true;
        await attempt(() => save(value));
        button.disabled = false;
      },
    },
    t("save"),
  );
  return h("span", { className: "inline" }, input, button);
}

function numberField(label, value, { allowEmpty = false } = {}) {
  const input = h("input", { type: "text", inputmode: "numeric", value: value === null ? "" : String(value), "aria-label": label });
  const read = () => {
    const raw = input.value.trim();
    if (raw === "" && allowEmpty) return null;
    return /^\d{1,7}$/.test(raw) ? Number(raw) : undefined;
  };
  return { input, read };
}

function toggle(checked, onChange, label) {
  const box = h("input", { type: "checkbox", "aria-label": label });
  box.checked = checked;
  box.addEventListener("change", async () => {
    box.disabled = true;
    const ok = await attempt(() => onChange(box.checked));
    if (!ok) box.checked = !box.checked;
    box.disabled = false;
  });
  return box;
}

// ---- Orders and daily report ----------------------------------------------------------------------------

async function renderOrders(root) {
  const dateInput = h("input", { type: "date", value: cairoToday(), "aria-label": t("date") });
  const kpis = h("div", { className: "kpis" });
  const table = h("div", { className: "table-wrap" });

  async function load() {
    const day = dateInput.value;
    if (!day) return;
    const [{ report }, { orders }] = await Promise.all([
      api.get(`/admin/reports/daily?date=${encodeURIComponent(day)}`),
      api.get(`/admin/orders?date=${encodeURIComponent(day)}&limit=200`),
    ]);
    const tile = (label, value) => h("div", { className: "kpi" }, h("div", { className: "value" }, value), h("div", { className: "label" }, label));
    clear(kpis);
    kpis.append(
      tile(t("revenue"), money(report.revenuePiastres)),
      tile(t("codExpected"), money(report.cod.expectedPiastres)),
      tile(t("codCollected"), money(report.cod.collectedPiastres)),
      tile(t("codOutstanding"), money(report.cod.outstandingPiastres)),
      tile(t("onlinePaid"), money(report.online.paidPiastres)),
      report.online.refundDuePiastres > 0 ? tile(t("refundDue"), money(report.online.refundDuePiastres)) : null,
      ...Object.entries(report.orders).map(([status, n]) => tile(t(status), String(n))),
    );
    clear(table);
    table.append(
      h(
        "table",
        null,
        h("thead", null, h("tr", null, ...["order", "time", "phone", "status", "total"].map((k) => h("th", null, t(k))))),
        h(
          "tbody",
          null,
          ...orders.map((o) =>
            h(
              "tr",
              null,
              h("td", null, `#${o.id}`),
              h("td", null, new Date(o.createdAt).toLocaleTimeString(lang === "ar" ? "ar-EG" : "en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit" })),
              h("td", { dir: "ltr" }, o.customerPhone),
              h("td", null, t(o.status)),
              h("td", null, money(o.totalPiastres)),
            ),
          ),
        ),
      ),
    );
  }

  dateInput.addEventListener("change", () => void load().catch(fail));
  root.append(h("div", { className: "form-row" }, h("label", null, t("date"), " ", dateInput)), kpis, table);
  await load();
}

// ---- Menu ------------------------------------------------------------------------------------------------

async function renderMenu(root) {
  const [{ items }, menu] = await Promise.all([api.get("/admin/items"), fetch("/menu").then((r) => r.json())]);
  const categories = menu.categories;
  const categoryName = (id) => {
    const c = categories.find((x) => x.id === id);
    return c ? (lang === "ar" ? c.nameAr : (c.nameEn ?? c.nameAr)) : String(id);
  };

  const rows = items.map((item) =>
    h(
      "tr",
      null,
      h("td", null, lang === "ar" || !item.nameEn ? item.nameAr : item.nameEn, h("div", { className: "tag" }, `${t(item.kind)} · ${categoryName(item.categoryId)}`)),
      h("td", null, toggle(item.isAvailable, (v) => api.patch(`/admin/items/${item.id}`, { isAvailable: v }), t("available"))),
      h(
        "td",
        null,
        ...item.sizes.map((size) =>
          h("div", { className: "inline" }, h("span", { className: "tag" }, size.label), priceEditor(size.pricePiastres, (p) => api.put(`/admin/sizes/${size.id}/price`, { pricePiastres: p }))),
        ),
      ),
    ),
  );

  const f = {
    nameAr: h("input", { "aria-label": t("name"), maxlength: 100 }),
    nameEn: h("input", { "aria-label": t("nameEn"), maxlength: 100 }),
    kind: h("select", { "aria-label": t("kind") }, ...["pizza", "side", "drink", "dessert"].map((k) => h("option", { value: k }, t(k)))),
    category: h("select", { "aria-label": t("category") }, ...categories.map((c) => h("option", { value: c.id }, categoryName(c.id)))),
    label: h("input", { "aria-label": t("label"), value: "regular", maxlength: 30 }),
    price: h("input", { type: "text", inputmode: "decimal", "aria-label": t("price") }),
  };
  const addButton = h(
    "button",
    {
      className: "primary",
      onClick: async () => {
        const price = parsePounds(f.price.value);
        if (!f.nameAr.value.trim() || !f.label.value.trim() || price === null) return toast(t("invalidNumber"), "error");
        const body = {
          categoryId: Number(f.category.value),
          kind: f.kind.value,
          nameAr: f.nameAr.value.trim(),
          ...(f.nameEn.value.trim() ? { nameEn: f.nameEn.value.trim() } : {}),
          sizes: [{ label: f.label.value.trim(), pricePiastres: price }],
        };
        if (await attempt(() => api.post("/admin/items", body))) await show(current);
      },
    },
    t("add"),
  );

  root.append(
    h("div", { className: "table-wrap" }, h("table", null, h("thead", null, h("tr", null, h("th", null, t("name")), h("th", null, t("available")), h("th", null, t("sizes")))), h("tbody", null, ...rows))),
    h(
      "div",
      { className: "panel" },
      h("strong", null, t("add")),
      h("div", { className: "form-row" }, f.nameAr, f.nameEn, f.kind, f.category, f.label, f.price, addButton),
    ),
  );
}

// ---- Toppings and crusts -------------------------------------------------------------------------------

const displayName = (x) => (lang === "ar" || !x.nameEn ? x.nameAr : x.nameEn);

async function renderToppings(root) {
  const { toppings } = await api.get("/admin/toppings");
  root.append(
    h(
      "div",
      { className: "table-wrap" },
      h(
        "table",
        null,
        h("thead", null, h("tr", null, h("th", null, t("name")), h("th", null, t("available")), h("th", null, t("price")))),
        h(
          "tbody",
          null,
          ...toppings.map((x) =>
            h(
              "tr",
              null,
              h("td", null, displayName(x)),
              h("td", null, toggle(x.isAvailable, (v) => api.put(`/admin/toppings/${x.id}/availability`, { isAvailable: v }), t("available"))),
              h("td", null, priceEditor(x.priceDeltaPiastres, (p) => api.put(`/admin/toppings/${x.id}/price`, { priceDeltaPiastres: p }))),
            ),
          ),
        ),
      ),
    ),
  );
}

async function renderCrusts(root) {
  const { crusts } = await api.get("/admin/crusts");
  root.append(
    h(
      "div",
      { className: "table-wrap" },
      h(
        "table",
        null,
        h("thead", null, h("tr", null, h("th", null, t("name")), h("th", null, t("price")))),
        h(
          "tbody",
          null,
          ...crusts.map((x) =>
            h("tr", null, h("td", null, displayName(x)), h("td", null, priceEditor(x.priceDeltaPiastres, (p) => api.put(`/admin/crusts/${x.id}/price`, { priceDeltaPiastres: p })))),
          ),
        ),
      ),
    ),
  );
}

// ---- Delivery zones --------------------------------------------------------------------------------------

async function renderZones(root) {
  const [{ zones }, { branches }] = await Promise.all([api.get("/admin/zones"), api.get("/admin/branches")]);

  const zoneRow = (zone) => {
    const radius = numberField(t("radius"), zone.radiusM);
    const fee = numberField(t("fee"), zone.feePiastres / 100);
    const min = numberField(t("minOrder"), zone.minOrderPiastres / 100);
    const eta = numberField(t("eta"), zone.etaMinutes, { allowEmpty: true });
    const save = h(
      "button",
      {
        onClick: async () => {
          const feeP = parsePounds(fee.input.value);
          const minP = parsePounds(min.input.value);
          const r = radius.read();
          const e = eta.read();
          if (feeP === null || minP === null || r === undefined || e === undefined) return toast(t("invalidNumber"), "error");
          await attempt(() => api.patch(`/admin/zones/${zone.id}`, { radiusM: r, feePiastres: feeP, minOrderPiastres: minP, etaMinutes: e }));
        },
      },
      t("save"),
    );
    const del = h(
      "button",
      {
        className: "danger",
        onClick: async () => {
          if (!window.confirm(t("confirmDelete"))) return;
          if (await attempt(() => api.delete(`/admin/zones/${zone.id}`))) await show(current);
        },
      },
      t("delete"),
    );
    return h("tr", null, h("td", null, zone.name), h("td", null, radius.input), h("td", null, fee.input), h("td", null, min.input), h("td", null, eta.input), h("td", null, h("span", { className: "inline" }, save, del)));
  };

  const nf = {
    branch: h("select", { "aria-label": t("branches") }, ...branches.map((b) => h("option", { value: b.id }, displayName(b)))),
    name: h("input", { "aria-label": t("name"), maxlength: 60 }),
    radius: numberField(t("radius"), 3000),
    fee: numberField(t("fee"), 15),
    min: numberField(t("minOrder"), 80),
    eta: numberField(t("eta"), 30, { allowEmpty: true }),
  };
  const add = h(
    "button",
    {
      className: "primary",
      onClick: async () => {
        const feeP = parsePounds(nf.fee.input.value);
        const minP = parsePounds(nf.min.input.value);
        const r = nf.radius.read();
        const e = nf.eta.read();
        if (!nf.name.value.trim() || feeP === null || minP === null || r === undefined || e === undefined) return toast(t("invalidNumber"), "error");
        const body = { branchId: Number(nf.branch.value), name: nf.name.value.trim(), radiusM: r, feePiastres: feeP, minOrderPiastres: minP, etaMinutes: e };
        if (await attempt(() => api.post("/admin/zones", body))) await show(current);
      },
    },
    t("add"),
  );

  root.append(
    h(
      "div",
      { className: "table-wrap" },
      h("table", null, h("thead", null, h("tr", null, ...["name", "radius", "fee", "minOrder", "eta"].map((k) => h("th", null, t(k))), h("th", null))), h("tbody", null, ...zones.map(zoneRow))),
    ),
    h("div", { className: "panel" }, h("strong", null, t("add")), h("div", { className: "form-row" }, nf.branch, nf.name, nf.radius.input, nf.fee.input, nf.min.input, nf.eta.input, add)),
  );
}

// ---- Branches --------------------------------------------------------------------------------------------

async function renderBranches(root) {
  const { branches } = await api.get("/admin/branches");
  root.append(
    h(
      "div",
      { className: "table-wrap" },
      h(
        "table",
        null,
        h("thead", null, h("tr", null, h("th", null, t("name")), h("th", null, t("phone")), h("th", null, t("open")))),
        h(
          "tbody",
          null,
          ...branches.map((b) =>
            h("tr", null, h("td", null, displayName(b)), h("td", { dir: "ltr" }, b.phone ?? "-"), h("td", null, toggle(b.isOpen, (v) => api.put(`/admin/branches/${b.id}/open`, { isOpen: v }), t("open")))),
          ),
        ),
      ),
    ),
  );
}

// ---- shell -----------------------------------------------------------------------------------------------

async function show(name) {
  current = name;
  for (const button of tabsEl.querySelectorAll("button")) button.setAttribute("aria-selected", String(button.dataset.tab === name));
  clear(content);
  content.append(h("p", null, t("loading")));
  const render = TABS.find(([id]) => id === name)?.[2];
  const fresh = h("div");
  try {
    await render(fresh);
    clear(content);
    content.append(fresh);
  } catch (err) {
    clear(content);
    fail(err);
  }
}

function buildTabs() {
  clear(tabsEl);
  for (const [id, key] of TABS) {
    tabsEl.append(h("button", { role: "tab", dataset: { tab: id }, "aria-selected": String(id === current), onClick: () => void show(id) }, t(key)));
  }
}

langButton.addEventListener("click", () => {
  toggleLanguage();
  setup();
});

document.getElementById("signout").addEventListener("click", async () => {
  await api.logout();
  location.replace("./");
});

function setup() {
  applyLanguage();
  langButton.textContent = lang === "ar" ? "English" : "العربية";
  buildTabs();
  void show(current);
}

setup();
