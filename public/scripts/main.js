/**
 * @file scripts/main.js
 * @description Shared UI utilities for Forever Planner.
 *
 * Exports:
 *   Toast          — non-blocking notifications
 *   formatCurrency — USD formatter
 *   escapeHtml     — XSS-safe string escaping
 *   uid            — simple client-side unique ID (kept for optimistic UI)
 *   markActiveNav  — highlights the current page in the nav
 *   initNav        — wires up the logout button and user display name
 */

"use strict";

import { Auth } from "./api.js";

/* ============================================================
   Toast — non-blocking UI notifications
   ============================================================ */
export class Toast {
  static _container = null;

  static _getContainer() {
    if (!this._container) {
      this._container = document.createElement("div");
      this._container.className = "toast-container";
      this._container.setAttribute("aria-live", "polite");
      this._container.setAttribute("aria-atomic", "true");
      document.body.appendChild(this._container);
    }
    return this._container;
  }

  /**
   * @param {string} message
   * @param {'default'|'success'|'error'} [type]
   * @param {number} [duration]
   */
  static show(message, type = "default", duration = 2800) {
    const el = document.createElement("div");
    el.className = `toast${type !== "default" ? " " + type : ""}`;
    el.textContent = message;
    this._getContainer().appendChild(el);
    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transition = "opacity .3s ease";
      setTimeout(() => el.remove(), 350);
    }, duration);
  }

  /** Show field-level validation errors returned by the API. */
  static showErrors(errors = []) {
    if (!errors.length) {
      return;
    }
    const msg = errors.map((e) => e.msg).join(" · ");
    Toast.show(msg, "error", 4000);
  }
}

/* ============================================================
   Utility helpers
   ============================================================ */

/**
 * Format a number as USD currency string.
 * @param {number} amount
 * @returns {string}
 */
export function formatCurrency(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount ?? 0);
}

/**
 * Escape user-provided strings to prevent XSS in innerHTML.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Generate a lightweight client-side unique ID.
 * Used only for optimistic UI (real IDs come from the server).
 * @returns {string}
 */
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/**
 * Mark the current page's nav link as active.
 */
export function markActiveNav() {
  const current = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".site-nav a").forEach((a) => {
    const href = a.getAttribute("href");
    a.classList.toggle(
      "active",
      href === current || (current === "" && href === "index.html"),
    );
  });
}

/**
 * Initialise the navigation bar:
 *   • Marks the active link
 *   • Injects the user's display name (if an element with id="nav-user" exists)
 *   • Wires up any element with id="logout-btn" to Auth.logout()
 */
export function initNav() {
  markActiveNav();

  // Show display name
  const nameEl = document.getElementById("nav-user");
  if (nameEl) {
    const user = Auth.getUser();
    nameEl.textContent = user?.display_name || user?.email || "";
  }

  // Wire logout
  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      Auth.logout();
    });
  }
}

/* ============================================================
   Loading / empty-state helpers
   ============================================================ */

/**
 * Show a full-section skeleton loader inside `container`.
 * @param {HTMLElement} container
 * @param {string}      [message]
 */
export function showLoading(container, message = "Loading…") {
  container.innerHTML = `
    <div class="loading-state" aria-live="polite">
      <span class="spinner" aria-hidden="true"></span>
      <span>${escapeHtml(message)}</span>
    </div>`;
}

/**
 * Show an API/network error message inside `container`.
 * @param {HTMLElement} container
 * @param {string}      [message]
 */
export function showError(
  container,
  message = "Something went wrong. Please try again.",
) {
  container.innerHTML = `
    <div class="error-state" role="alert">
      <span class="empty-icon" aria-hidden="true">⚠️</span>
      <p>${escapeHtml(message)}</p>
    </div>`;
}
