"use strict";

const TOKEN_KEY = "fp_token";
const USER_KEY = "fp_user";
const WEDDING_KEY = "fp_wedding_id";

/* ── Wedding store ─────────────────────────────────────────── */
export const WeddingStore = {
  getActiveId() {
    return localStorage.getItem(WEDDING_KEY);
  },
  setActiveId(id) {
    if (id) {
      localStorage.setItem(WEDDING_KEY, id);
    } else {
      localStorage.removeItem(WEDDING_KEY);
    }
  },
  clear() {
    localStorage.removeItem(WEDDING_KEY);
  },
};

/* ── Auth ──────────────────────────────────────────────────── */
export const Auth = {
  getToken() {
    return localStorage.getItem(TOKEN_KEY);
  },
  setToken(t) {
    localStorage.setItem(TOKEN_KEY, t);
  },
  getUser() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY));
    } catch {
      return null;
    }
  },
  setUser(u) {
    localStorage.setItem(USER_KEY, JSON.stringify(u));
  },

  clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    WeddingStore.clear();
  },

  isLoggedIn() {
    return !!this.getToken();
  },

  async register({ email, password, displayName }) {
    const { data } = await api.post("/auth/register", {
      email,
      password,
      displayName,
    });
    Auth.setToken(data.token);
    Auth.setUser(data.user);
    return data;
  },

  async login({ email, password }) {
    const { data } = await api.post("/auth/login", { email, password });
    Auth.setToken(data.token);
    Auth.setUser(data.user);
    return data;
  },

  logout() {
    Auth.clearSession();
    window.location.href = "/login.html";
  },

  requireAuth() {
    if (!Auth.isLoggedIn()) {
      window.location.href = "/login.html";
    }
  },
};

/* ── ApiResponseError ──────────────────────────────────────── */
export class ApiResponseError extends Error {
  constructor(status, message, errors = []) {
    super(message);
    this.name = "ApiResponseError";
    this.status = status;
    this.errors = errors;
  }
}

/* ── Core client ───────────────────────────────────────────── */
const BASE_URL = "/api/v1";

const api = {
  async request(path, { method = "GET", body, query } = {}) {
    let url = `${BASE_URL}${path}`;
    if (query && Object.keys(query).length) {
      const filtered = Object.fromEntries(
        Object.entries(query).filter(
          ([, v]) => v !== undefined && v !== null && v !== "",
        ),
      );
      if (Object.keys(filtered).length) {
        url += "?" + new URLSearchParams(filtered).toString();
      }
    }

    const headers = { "Content-Type": "application/json" };

    const token = Auth.getToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const weddingId = WeddingStore.getActiveId();
    if (weddingId) {
      headers["X-Wedding-ID"] = weddingId;
    }

    const resp = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (resp.status === 204) {
      return { success: true, data: null };
    }

    const json = await resp.json().catch(() => ({
      success: false,
      message: `HTTP ${resp.status}`,
      errors: [],
    }));

    if (!resp.ok) {
      if (resp.status === 401) {
        Auth.clearSession();
        window.location.href = "/login.html";
        throw new ApiResponseError(
          401,
          "Session expired. Please log in again.",
        );
      }
      throw new ApiResponseError(
        resp.status,
        json.message || `HTTP ${resp.status}`,
        json.errors || [],
      );
    }

    return json;
  },

  get(path, query) {
    return this.request(path, { method: "GET", query });
  },
  post(path, body) {
    return this.request(path, { method: "POST", body });
  },
  put(path, body) {
    return this.request(path, { method: "PUT", body });
  },
  patch(path, body) {
    return this.request(path, { method: "PATCH", body });
  },
  delete(path) {
    return this.request(path, { method: "DELETE" });
  },
};

export default api;
