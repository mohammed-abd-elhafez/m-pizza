import { ApiError, createApi } from "./api.js";
import { applyLanguage, lang, t, toggleLanguage } from "./i18n.js";

const api = createApi();
const form = document.getElementById("login-form");
const errorEl = document.getElementById("login-error");
const submit = document.getElementById("submit");
const langButton = document.getElementById("lang");

const home = (role) => (role === "admin" ? "admin.html" : "kitchen.html");

function refreshLanguage() {
  applyLanguage();
  langButton.textContent = lang === "ar" ? "English" : "العربية";
}

langButton.addEventListener("click", () => {
  toggleLanguage();
  refreshLanguage();
});

if (api.token && api.role) location.replace(home(api.role));
refreshLanguage();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorEl.textContent = "";
  submit.disabled = true;
  try {
    const username = form.elements.username.value.trim();
    const password = form.elements.password.value;
    const session = await api.login(username, password);
    location.replace(home(session.role));
  } catch (err) {
    const tooMany = err instanceof ApiError && err.status === 429;
    errorEl.textContent = tooMany ? t("tooMany") : t("badLogin");
    form.elements.password.value = "";
  } finally {
    submit.disabled = false;
  }
});
