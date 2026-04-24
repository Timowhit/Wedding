"use strict";

import api, { Auth, WeddingStore } from "./api.js";

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
   Nav init
   ============================================================ */
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

  // Hamburger menu injection
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

  // Async: inject wedding switcher (fire-and-forget)
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

    // Initialise active wedding if not yet set
    if (!WeddingStore.getActiveId()) {
      WeddingStore.setActiveId(weddings[0].id);
    }

    _renderWeddingSwitcher(weddings);
  } catch {
    // silently ignore — don't break nav
  }
}

function _renderWeddingSwitcher(weddings) {
  const nav = document.querySelector(".site-nav");
  if (!nav || nav.querySelector(".wedding-switcher")) {
    return;
  }

  const activeId = WeddingStore.getActiveId() || weddings[0].id;

  const select = document.createElement("select");
  select.className = "wedding-switcher";
  select.setAttribute("aria-label", "Switch wedding");
  select.title = "Switch wedding";

  weddings.forEach((w) => {
    const opt = document.createElement("option");
    opt.value = w.id;
    opt.textContent = w.name;
    opt.selected = w.id === activeId;
    select.appendChild(opt);
  });

  // Separator + join option
  const sep = document.createElement("option");
  sep.disabled = true;
  sep.textContent = "──────────";
  select.appendChild(sep);

  const joinOpt = document.createElement("option");
  joinOpt.value = "__join__";
  joinOpt.textContent = "+ Join another…";
  select.appendChild(joinOpt);

  select.addEventListener("change", () => {
    const val = select.value;
    if (val === "__join__") {
      // Reset dropdown to current value and open modal instead
      select.value = activeId;
      showInviteModal();
      return;
    }
    WeddingStore.setActiveId(val);
    location.reload();
  });

  // Insert after brand, before hamburger
  const brand = nav.querySelector(".brand");
  const burger = nav.querySelector(".hamburger");
  if (burger) {
    nav.insertBefore(select, burger);
  } else {
    brand.after(select);
  }
}

/* ============================================================
   Invite / Join Modal
   ============================================================ */

/**
 * Show the join-a-wedding modal.
 * Pass an array of pending-invite objects to pre-populate them,
 * or omit/pass null to fetch them automatically.
 */
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

  // Accept pending-invite cards
  overlay.querySelectorAll(".accept-invite-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const token = btn.closest("[data-token]").dataset.token;
      _acceptToken(token, btn, overlay);
    });
  });

  // Join with pasted token/link
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

    // Refresh wedding list and switch context to the newly joined wedding
    const { data } = await api.get("/weddings");
    const weddings = data.weddings || [];
    const joined = weddings.find((w) => w.role !== "owner") ?? weddings.at(-1);
    if (joined) {
      WeddingStore.setActiveId(joined.id);
    }

    overlay.remove();
    Toast.show(`Joined "${joined?.name ?? "wedding"}"! 🎉`, "success");
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

function _modalError(overlay, msg) {
  const el = overlay.querySelector("#fp-modal-error");
  el.textContent = msg;
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
