export class ApiError extends Error {
  /**
   * @param {number} status
   * @param {string} code
   * @param {string} message
   */
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const TOKEN_KEY = "mpizza.staff.token";
const ROLE_KEY = "mpizza.staff.role";

/** Session storage keeps the token only for this browser tab, and it is also revoked server-side on logout. */
function safeStorage() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function createApi(storage = safeStorage(), fetchFn = (...args) => fetch(...args)) {
  const memory = new Map();
  const read = (key) => (storage ? storage.getItem(key) : (memory.get(key) ?? null));
  const write = (key, value) => (storage ? storage.setItem(key, value) : memory.set(key, value));
  const drop = (key) => (storage ? storage.removeItem(key) : memory.delete(key));

  async function request(method, path, body) {
    const token = read(TOKEN_KEY);
    const headers = { accept: "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers["content-type"] = "application/json";

    let res;
    try {
      res = await fetchFn(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new ApiError(0, "NETWORK", "Network error");
    }
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = data && data.error ? data.error : {};
      throw new ApiError(res.status, e.code ?? "ERROR", e.message ?? `HTTP ${res.status}`);
    }
    return data;
  }

  return {
    get token() {
      return read(TOKEN_KEY);
    },
    get role() {
      return read(ROLE_KEY);
    },
    get: (path) => request("GET", path),
    post: (path, body) => request("POST", path, body ?? {}),
    put: (path, body) => request("PUT", path, body),
    patch: (path, body) => request("PATCH", path, body),
    delete: (path) => request("DELETE", path),

    async login(username, password) {
      const res = await request("POST", "/staff/login", { username, password });
      write(TOKEN_KEY, res.token);
      write(ROLE_KEY, res.role);
      return res;
    },
    async logout() {
      try {
        await request("POST", "/auth/logout", {});
      } catch {
        // The local session is dropped regardless.
      }
      drop(TOKEN_KEY);
      drop(ROLE_KEY);
    },
  };
}
