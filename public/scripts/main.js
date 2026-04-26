"use strict";

import api, { Auth, WeddingStore } from "./api.js";
import { t, applyTranslations, syncLangFromUser } from "./i18n.js";
import { initLangSwitcher } from "./lang-switcher.js";

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
    Toast.show(errors.map((e) => e.msg).join(" · "), "error", 4000);
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

/* ============================================================
   Nav init — translates nav links + initialises lang switcher
   ============================================================ */

/** Map nav link hrefs → i18n keys */
const NAV_HREF_KEYS = {
  "index.html": "nav.dashboard",
  "budget.html": "nav.budget",
  "vendors.html": "nav.vendors",
  "music.html": "nav.music",
  "inspiration.html": "nav.inspiration",
  "guests.html": "nav.guests",
  "checklist.html": "nav.checklist",
  "settings.html": "nav.settings",
};

export function initNav() {
  // Sync language from cached user profile (no extra API call)
  syncLangFromUser(Auth.getUser());

  markActiveNav();

  // Display user name
  const nameEl = document.getElementById("nav-user");
  if (nameEl) {
    const user = Auth.getUser();
    nameEl.textContent = user?.display_name || user?.email || "";
  }

  // Translate nav links
  document.querySelectorAll(".site-nav a:not(.brand)").forEach((link) => {
    const href = link.getAttribute("href");
    const key = NAV_HREF_KEYS[href];
    if (key) {
      link.textContent = t(key);
    }
  });

  // Translate logout button text
  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.textContent = t("nav.signOut");
    logoutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      Auth.logout();
    });
  }

  // Apply all data-i18n translations on the page
  applyTranslations();

  // Mount the floating language switcher
  initLangSwitcher();

  // Hamburger menu
  const nav = document.querySelector(".site-nav");
  if (nav && !nav.querySelector(".hamburger")) {
    const brand = nav.querySelector(".brand");
    const links = [...nav.querySelectorAll("a:not(.brand), button.nav-logout")];
    const navUserGroup = nav.querySelector(".nav-user-group");

    if (links.length && brand) {
      const linksWrapper = document.createElement("div");
      linksWrapper.className = "nav-links";
      links.forEach((l) => linksWrapper.appendChild(l));

      const hamburger = document.createElement("button");
      hamburger.className = "hamburger";
      hamburger.setAttribute("aria-label", "Toggle navigation menu");
      hamburger.setAttribute("aria-expanded", "false");
      hamburger.innerHTML = "<span></span><span></span><span></span>";

      brand.after(hamburger);
      if (navUserGroup) {
        hamburger.after(linksWrapper);
        linksWrapper.after(navUserGroup);
      } else {
        hamburger.after(linksWrapper);
      }

      hamburger.addEventListener("click", (e) => {
        e.stopPropagation();
        const open = linksWrapper.classList.toggle("open");
        hamburger.classList.toggle("open", open);
        hamburger.setAttribute("aria-expanded", String(open));
      });
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
      linksWrapper.addEventListener("click", (e) => {
        if (e.target.tagName === "A") {
          linksWrapper.classList.remove("open");
          hamburger.classList.remove("open");
          hamburger.setAttribute("aria-expanded", "false");
        }
      });
    }
  }

  // Async: inject wedding switcher
  _loadWeddingSwitcher();
}

/* ============================================================
   Wedding Switcher
   ============================================================ */
async function _loadWeddingSwitcher() {
  try {
    const { data } = await api.get("/weddings");
    const weddings = data.weddings || [];
    if (!weddings.length) {
      return;
    }

    if (!WeddingStore.getActiveId()) {
      WeddingStore.setActiveId(weddings[0].id);
    }

    _renderWeddingSwitcher(weddings);
  } catch {
    // silently ignore
  }
}

function _renderWeddingSwitcher(weddings) {
  const nav = document.querySelector(".site-nav");
  if (!nav || nav.querySelector(".ws-trigger")) {
    return;
  }

  const activeId = WeddingStore.getActiveId() || weddings[0].id;
  const activeWedding = weddings.find((w) => w.id === activeId) || weddings[0];

  // ── Wrapper ──────────────────────────────────────────────
  const wrapper = document.createElement("div");
  wrapper.className = "ws-wrapper";
  wrapper.setAttribute("role", "region");
  wrapper.setAttribute("aria-label", "Wedding selector");

  // ── Trigger pill ─────────────────────────────────────────
  const trigger = document.createElement("button");
  trigger.className = "ws-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.innerHTML = `
    <span class="ws-trigger-name">${escapeHtml(activeWedding.name)}</span>
    <svg class="ws-chevron" viewBox="0 0 12 7" aria-hidden="true">
      <path d="M1 1l5 5 5-5" stroke="currentColor" stroke-width="1.8"
            fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;

  // ── Dropdown panel ────────────────────────────────────────
  const panel = document.createElement("div");
  panel.className = "ws-panel";
  panel.setAttribute("role", "listbox");
  panel.setAttribute("aria-label", "Your weddings");
  panel.hidden = true;

  // Header label
  const header = document.createElement("div");
  header.className = "ws-panel-header";
  header.textContent = "Your Weddings";
  panel.appendChild(header);

  // Wedding options
  weddings.forEach((w) => {
    const item = document.createElement("button");
    item.className = "ws-item" + (w.id === activeId ? " ws-item--active" : "");
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", String(w.id === activeId));
    item.dataset.id = w.id;
    item.innerHTML = `
      <span class="ws-item-ring" aria-hidden="true">
        ${w.id === activeId ? `<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="3.5" fill="currentColor"/></svg>` : ""}
      </span>
      <span class="ws-item-name">${escapeHtml(w.name)}</span>
      ${
        w.id === activeId
          ? `<svg class="ws-item-check" viewBox="0 0 14 11" aria-hidden="true">
        <path d="M1 5.5l4 4 8-8" stroke="currentColor" stroke-width="2"
              fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`
          : ""
      }`;
    item.addEventListener("click", () => {
      if (w.id !== activeId) {
        WeddingStore.setActiveId(w.id);
        location.reload();
      }
      closePanel();
    });
    panel.appendChild(item);
  });

  // Divider + Join option
  const divider = document.createElement("div");
  divider.className = "ws-divider";
  panel.appendChild(divider);

  const joinBtn = document.createElement("button");
  joinBtn.className = "ws-item ws-item--join";
  joinBtn.setAttribute("role", "option");
  joinBtn.setAttribute("aria-selected", "false");
  joinBtn.innerHTML = `
    <span class="ws-join-icon" aria-hidden="true">
      <svg viewBox="0 0 12 12"><path d="M6 1v10M1 6h10"
        stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    </span>
    <span class="ws-item-name">Join another…</span>`;
  joinBtn.addEventListener("click", () => {
    closePanel();
    showInviteModal();
  });
  panel.appendChild(joinBtn);

  wrapper.appendChild(trigger);
  wrapper.appendChild(panel);

  // ── Open / close ──────────────────────────────────────────
  function openPanel() {
    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    wrapper.classList.add("ws-open");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => panel.classList.add("ws-panel--visible"));
    });
  }

  function closePanel() {
    panel.classList.remove("ws-panel--visible");
    wrapper.classList.remove("ws-open");
    trigger.setAttribute("aria-expanded", "false");
    setTimeout(() => {
      panel.hidden = true;
    }, 230);
  }

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    panel.hidden ? openPanel() : closePanel();
  });

  document.addEventListener("click", (e) => {
    if (!wrapper.contains(e.target)) {
      closePanel();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closePanel();
    }
  });

  // ── Mount ─────────────────────────────────────────────────
  const brand = nav.querySelector(".brand");
  const burger = nav.querySelector(".hamburger");
  if (burger) {
    nav.insertBefore(wrapper, burger);
  } else {
    brand.after(wrapper);
  }
}

/* ============================================================
   Invite / Join Modal
   ============================================================ */
export async function showInviteModal(pendingInvites = null) {
  document.getElementById("fp-invite-modal")?.remove();

  let invites = pendingInvites;
  if (invites === null) {
    try {
      const { data } = await api.get("/weddings/my-pending-invites");
      invites = data.invites || [];
    } catch {
      invites = [];
    }
  }

  const overlay = document.createElement("div");
  overlay.id = "fp-invite-modal";
  overlay.className = "modal-overlay";

  const hasInvites = invites.length > 0;

  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="fp-modal-title">
      <div class="modal-header">
        <h2 id="fp-modal-title" class="modal-title">
          ${hasInvites ? "💌 Pending Invitations" : "💍 Join a Wedding"}
        </h2>
        <button class="modal-close" aria-label="Close">✕</button>
      </div>

      ${
        hasInvites
          ? `
        <div class="modal-invites">
          ${invites
            .map(
              (inv) => `
            <div class="modal-invite-card" data-token="${escapeHtml(inv.token)}">
              <div class="modal-invite-info">
                <strong>${escapeHtml(inv.wedding_name)}</strong>
                <span class="modal-invite-meta">
                  From ${escapeHtml(inv.invited_by_name)} · ${escapeHtml(inv.role)}
                </span>
              </div>
              <button class="btn btn-primary accept-invite-btn"
                      style="padding:6px 16px;font-size:.82rem;white-space:nowrap;">
                Accept
              </button>
              <button class="btn btn-ghost decline-invite-btn"
                style="padding:6px 16px;font-size:.82rem;white-space:nowrap;">
                Decline
              </button>
            </div>
          `,
            )
            .join("")}
        </div>
        <div class="modal-divider"><span>or paste a link</span></div>
      `
          : `
        <p class="modal-desc">
          Paste an invite link or token shared with you to join a wedding.
        </p>
      `
      }

      <div class="modal-token-row">
        <input type="text" id="fp-modal-input" class="modal-token-input"
               placeholder="https://…?token=… or raw UUID" autocomplete="off" />
        <button class="btn btn-primary" id="fp-modal-join-btn">Join</button>
      </div>
      <p class="modal-error" id="fp-modal-error"></p>

      <button class="btn btn-ghost btn-full" id="fp-modal-dismiss"
              style="margin-top:12px;font-size:.85rem;">Not now</button>
    </div>
  `;

  document.body.appendChild(overlay);

  const input = overlay.querySelector("#fp-modal-input");
  const joinBtn = overlay.querySelector("#fp-modal-join-btn");
  const dismiss = () => overlay.remove();

  overlay.querySelector(".modal-close").addEventListener("click", dismiss);
  overlay.querySelector("#fp-modal-dismiss").addEventListener("click", dismiss);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      dismiss();
    }
  });

  overlay.querySelectorAll(".accept-invite-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const token = btn.closest("[data-token]").dataset.token;
      _acceptToken(token, btn, overlay);
    });
  });
  overlay.querySelectorAll(".decline-invite-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const token = btn.closest("[data-token]").dataset.token;
      _declineToken(token, btn, overlay);
    });
  });

  joinBtn.addEventListener("click", () => {
    const token = _extractToken(input.value.trim());
    if (!token) {
      _modalError(overlay, "Please paste a valid invite link or UUID token.");
      return;
    }
    _acceptToken(token, joinBtn, overlay);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      joinBtn.click();
    }
  });

  input.focus();
}

function _extractToken(raw) {
  const byParam = raw.match(/[?&]token=([0-9a-f-]{36})/i);
  if (byParam) {
    return byParam[1];
  }
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)
  ) {
    return raw;
  }
  return null;
}

async function _acceptToken(token, btn, overlay) {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Joining…";

  try {
    await api.post(`/weddings/invites/${token}/accept`);
    const { data } = await api.get("/weddings");
    const weddings = data.weddings || [];
    const joined = weddings.find((w) => w.role !== "owner") ?? weddings.at(-1);
    if (joined) {
      WeddingStore.setActiveId(joined.id);
    }

    overlay.remove();
    Toast.show(
      t("toast.inviteJoined", { name: joined?.name ?? "wedding" }),
      "success",
    );
    setTimeout(() => location.reload(), 900);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = original;
    const msg =
      err.status === 404
        ? "Invite not found or has expired."
        : err.status === 409
          ? "You already belong to this wedding."
          : err.message || "Could not accept invite.";
    _modalError(overlay, msg);
  }
}
async function _declineToken(token, btn, overlay) {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Declining…";

  try {
    await api.post(`/weddings/invites/${token}/decline`);
    const card = btn.closest("[data-token]");
    card.remove();

    // If no cards left, collapse to the plain join view
    const remaining = overlay.querySelectorAll(".modal-invite-card");
    if (remaining.length === 0) {
      overlay.remove();
      showInviteModal([]);
    }
  } catch (err) {
    btn.disabled = false;
    btn.textContent = original;
    _modalError(overlay, err.message || "Could not decline invite.");
  }
}

function _modalError(overlay, msg) {
  const el = overlay.querySelector("#fp-modal-error");
  el.textContent = msg;
}

/* ============================================================
   Invite polling — auto-popup when a new invite arrives
   ============================================================ */
let _pollInterval = null;
const _seenTokens = new Set();

/**
 * Call once on app init (e.g. after login).
 * Default: checks every 30 s. Pass a shorter value during dev.
 */
export function startInvitePolling(intervalMs = 30_000) {
  stopInvitePolling();
  _pollInvites(); // immediate first check
  _pollInterval = setInterval(_pollInvites, intervalMs);
}

export function stopInvitePolling() {
  if (_pollInterval) {
    clearInterval(_pollInterval);
    _pollInterval = null;
  }
}

async function _pollInvites() {
  if (document.getElementById("fp-invite-modal")) {
    return;
  } // modal already open
  try {
    const { data } = await api.get("/weddings/my-pending-invites");
    const invites = data.invites || [];
    const newInvites = invites.filter((inv) => !_seenTokens.has(inv.token));

    if (newInvites.length > 0) {
      invites.forEach((inv) => _seenTokens.add(inv.token));
      showInviteModal(invites); // pops up automatically
    }
  } catch {
    // network blip — silently skip, try again next interval
  }
}

/* ============================================================
   Loading / error state helpers
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

/* Re-export t so page scripts can import from one place */
export { t } from "./i18n.js";
