// Tiny DOM builder. Text always goes through textContent / text nodes, never innerHTML, so values that
// come from customers (notes, landmarks, names) can never be interpreted as markup.

/**
 * @param {string} tag
 * @param {Record<string, any> | null} [props]  className, dataset, on* handlers, and plain attributes
 * @param {...(Node | string | number | null | undefined | false)} children
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "className") el.className = value;
    else if (key === "dataset") Object.assign(el.dataset, value);
    else if (key.startsWith("on")) {
      if (typeof value !== "function") throw new Error("event handlers must be functions");
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === "href" || key === "src" || key === "srcdoc" || key === "style") throw new Error(`${key} is not allowed`);
    else if (key === "innerHTML" || key === "outerHTML") throw new Error("innerHTML is not allowed");
    else el.setAttribute(key, value === true ? "" : String(value));
  }
  append(el, children);
  return el;
}

function append(parent, children) {
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function clear(el) {
  el.replaceChildren();
}

/** Shows a short, auto-dismissing message in the #toast element. */
export function toast(message, kind = "info") {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.dataset.kind = kind;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    el.hidden = true;
  }, 4000);
}
