/**
 * @file scripts/api.js
 * @description Centralised API client for Forever Planner.
 *
 * All fetch calls go through `api.request()` which:
 *   • Attaches the Bearer JWT automatically
 *   • Parses JSON responses
 *   • Redirects to /login.html on 401
 *   • Throws ApiResponseError on non-2xx so callers can catch cleanly
 *
 * Usage:
 *   import api from './api.js';
 *   const { data } = await api.get('/budget/summary');
 *   const { data } = await api.post('/guests', { name: 'Jane', rsvp: 'Pending' });
 *   await api.delete(`/budget/${id}`);
 */

"use strict";

/* ── Token storage ─────────────────────────────────────────── */
const TOKEN_KEY = "fp_token";
const USER_KEY = "fp_user";

export const Auth = {
  /** @returns {string|null} */
  getToken() {
    return localStorage.getItem(TOKEN_KEY);
  },

  /** @param {string} token */
  setToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
  },

  /** @returns {{ id, email, display_name }|null} */
  getUser() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY));
    } catch {
      return null;
    }
  },

  /** @param {{ id, email, display_name }} user */
  setUser(user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },

  clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },

  isLoggedIn() {
    return !!this.getToken();
  },

  /**
   * Register a new account.
   * @param {{ email, password, displayName? }} payload
   */
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

  /**
   * Log in and persist credentials.
   * @param {{ email, password }} payload
   */
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

  /**
   * Redirect to login if not authenticated.
   * Call at the top of every protected page script.
   */
  requireAuth() {
    if (!Auth.isLoggedIn()) {
      window.location.href = "/login.html";
    }
  },
};

/* ── ApiResponseError ──────────────────────────────────────── */
export class ApiResponseError extends Error {
  /**
   * @param {number} status
   * @param {string} message
   * @param {Array}  errors   field-level errors from the API
   */
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
  /**
   * Make an authenticated API request.
   *
   * @param {string}  path     e.g. '/budget/summary'
   * @param {object}  [opts]
   * @param {string}  [opts.method='GET']
   * @param {*}       [opts.body]        Will be JSON-serialised
   * @param {object}  [opts.query]       URL search params
   * @returns {Promise<{ success: boolean, data: *, meta?: * }>}
   * @throws {ApiResponseError}
   */
  async request(path, { method = "GET", body, query } = {}) {
    // Build URL
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

    // Build headers
    const headers = { "Content-Type": "application/json" };
    const token = Auth.getToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    // Fetch
    const resp = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    // 204 No Content — nothing to parse
    if (resp.status === 204) {
      return { success: true, data: null };
    }

    const json = await resp.json().catch(() => ({
      success: false,
      message: `HTTP ${resp.status}`,
      errors: [],
    }));

    if (!resp.ok) {
      // Token expired or invalid → kick to login
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

  /* ── Convenience methods ───────────────────────────────── */

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
