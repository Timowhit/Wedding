/**
 * @file scripts/main.js
 *
 * Changes: initNav() now injects a hamburger button on mobile and wraps
 * page links in a collapsible .nav-links container.
 */

"use strict";

import { Auth } from "./api.js";

/* ============================================================
   Toast
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

export function formatCurrency(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount ?? 0);
}

export function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

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
 * Initialise the navigation bar.
 *  • Marks the active link
 *  • Injects the user's display name
 *  • Wires logout button
 *  • Injects a hamburger button for mobile (wraps page links in .nav-links)
 */
export function initNav() {
  markActiveNav();

  const nameEl = document.getElementById("nav-user");
  if (nameEl) {
    const user = Auth.getUser();
    nameEl.textContent = user?.display_name || user?.email || "";
  }

  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      Auth.logout();
    });
  }

  // ── Hamburger menu injection ────────────────────────────
  const nav = document.querySelector(".site-nav");
  if (nav && !nav.querySelector(".hamburger")) {
    const brand = nav.querySelector(".brand");
    // Only the page links (not brand, not nav-user-group children)
    const links = [...nav.querySelectorAll("a:not(.brand)")];
    const navUserGroup = nav.querySelector(".nav-user-group");

    if (links.length && brand) {
      // 1. Wrap page links in collapsible container
      const linksWrapper = document.createElement("div");
      linksWrapper.className = "nav-links";
      links.forEach((l) => linksWrapper.appendChild(l));

      // 2. Build hamburger button
      const hamburger = document.createElement("button");
      hamburger.className = "hamburger";
      hamburger.setAttribute("aria-label", "Toggle navigation menu");
      hamburger.setAttribute("aria-expanded", "false");
      hamburger.innerHTML = "<span></span><span></span><span></span>";

      // 3. Insert into DOM: brand | hamburger | nav-user-group | linksWrapper
      brand.after(hamburger);
      if (navUserGroup) {
        hamburger.after(linksWrapper);
        linksWrapper.after(navUserGroup);
      } 
      else {
        hamburger.after(linksWrapper);
      }

      // 4. Toggle handler
      hamburger.addEventListener("click", (e) => {
        e.stopPropagation();
        const open = linksWrapper.classList.toggle("open");
        hamburger.classList.toggle("open", open);
        hamburger.setAttribute("aria-expanded", String(open));
      });

      // 5. Close when clicking outside
      document.addEventListener("click", (e) => {
        if (
          !nav.contains(e.target) &&
          linksWrapper.classList.contains("open")
        ) {
          linksWrapper.classList.remove("open");
          hamburger.classList.remove("open");
          hamburger.setAttribute("aria-expanded", "false");
        }
      });

      // 6. Close when a nav link is followed
      linksWrapper.addEventListener("click", (e) => {
        if (e.target.tagName === "A") {
          linksWrapper.classList.remove("open");
          hamburger.classList.remove("open");
          hamburger.setAttribute("aria-expanded", "false");
        }
      });
    }
  }
}

/* ============================================================
   Loading / empty-state helpers
   ============================================================ */

export function showLoading(container, message = "Loading…") {
  container.innerHTML = `
    <div class="loading-state" aria-live="polite">
      <span class="spinner" aria-hidden="true"></span>
      <span>${escapeHtml(message)}</span>
    </div>`;
}

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
