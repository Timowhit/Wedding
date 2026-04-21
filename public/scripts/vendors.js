/**
 * @file scripts/vendors.js
 * @description VendorManager — API-backed vendor list with status cycling.
 */

import api, { Auth } from "./api.js";
import { initNav, Toast, escapeHtml, showLoading } from "./main.js";

Auth.requireAuth();

const STATUS_STYLES = {
  Booked: "badge-confirmed",
  Declined: "badge-declined",
  Contacted: "badge-pending",
  Researching: "badge-cat",
};

class VendorManager {
  constructor() {
    this._activeFilter = "All";

    this._nameInput = document.getElementById("vendor-name");
    this._catSelect = document.getElementById("vendor-category");
    this._phoneInput = document.getElementById("vendor-phone");
    this._emailInput = document.getElementById("vendor-email");
    this._websiteInput = document.getElementById("vendor-website");
    this._statusSelect = document.getElementById("vendor-status");
    this._notesInput = document.getElementById("vendor-notes");
    this._addBtn = document.getElementById("add-vendor-btn");

    this._list = document.getElementById("vendor-list");
    this._emptyState = document.getElementById("vendor-empty");
  }

  async init() {
    initNav();
    this._bindEvents();
    await this._load();
  }

  _bindEvents() {
    this._addBtn.addEventListener("click", () => this._add());

    document.querySelectorAll(".filter-tab").forEach((tab) =>
      tab.addEventListener("click", () => {
        document
          .querySelectorAll(".filter-tab")
          .forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        this._activeFilter = tab.dataset.status;
        this._load();
      }),
    );
  }

  /* ── Load ─────────────────────────────────────────────── */
  async _load() {
    showLoading(this._list, "Loading vendors…");
    this._emptyState.hidden = true;

    const query =
      this._activeFilter !== "All" ? { status: this._activeFilter } : {};
    try {
      const { data } = await api.get("/vendors", query);
      this._renderList(data.vendors);
    } catch (err) {
      this._list.innerHTML = "";
      Toast.show("Could not load vendors.", "error");
    }
  }

  /* ── Add ──────────────────────────────────────────────── */
  async _add() {
    const name = this._nameInput.value.trim();
    if (!name) {
      return Toast.show("Please enter a vendor name.", "error");
    }

    this._addBtn.disabled = true;
    try {
      await api.post("/vendors", {
        name,
        category: this._catSelect.value,
        phone: this._phoneInput.value.trim() || undefined,
        email: this._emailInput.value.trim() || undefined,
        website: this._websiteInput.value.trim() || undefined,
        status: this._statusSelect.value,
        notes: this._notesInput.value.trim() || undefined,
      });

      [
        this._nameInput,
        this._phoneInput,
        this._emailInput,
        this._websiteInput,
        this._notesInput,
      ].forEach((el) => {
        el.value = "";
      });
      this._nameInput.focus();
      Toast.show(`${name} added!`, "success");
      await this._load();
    } catch (err) {
      Toast.show(err.message || "Could not add vendor.", "error");
    } finally {
      this._addBtn.disabled = false;
    }
  }

  /* ── Cycle status ─────────────────────────────────────── */
  async _cycleStatus(id) {
    try {
      await api.post(`/vendors/${id}/cycle-status`);
      await this._load();
    } catch (err) {
      Toast.show(err.message || "Could not update status.", "error");
    }
  }

  /* ── Delete ───────────────────────────────────────────── */
  async _delete(id) {
    try {
      await api.delete(`/vendors/${id}`);
      Toast.show("Vendor removed.");
      await this._load();
    } catch (err) {
      Toast.show(err.message || "Could not remove vendor.", "error");
    }
  }

  /* ── Render ───────────────────────────────────────────── */
  _renderList(vendors) {
    this._emptyState.hidden = vendors.length > 0;
    if (!vendors.length) {
      this._list.innerHTML = "";
      return;
    }

    this._list.innerHTML = vendors
      .map((v) => {
        const badgeClass = STATUS_STYLES[v.status] || "badge-cat";
        const contact = [
          v.phone &&
            `<a href="tel:${escapeHtml(v.phone)}" style="color:var(--primary)">${escapeHtml(v.phone)}</a>`,
          v.email &&
            `<a href="mailto:${escapeHtml(v.email)}" style="color:var(--primary)">${escapeHtml(v.email)}</a>`,
          v.website &&
            `<a href="${escapeHtml(v.website)}" target="_blank" rel="noopener noreferrer" style="color:var(--primary)">Website ↗</a>`,
        ]
          .filter(Boolean)
          .join(" · ");

        return `
        <li class="item-card vendor-card" data-id="${escapeHtml(v.id)}">
          <div class="item-info">
            <div class="item-name">${escapeHtml(v.name)}</div>
            <div class="item-meta">
              <span class="item-badge badge-cat">${escapeHtml(v.category)}</span>
              ${contact ? `&nbsp;· ${contact}` : ""}
              ${v.notes ? `<br><em style="opacity:.8">${escapeHtml(v.notes)}</em>` : ""}
            </div>
          </div>
          <button class="item-badge ${badgeClass} status-btn"
                  style="border:none;cursor:pointer;white-space:nowrap;"
                  aria-label="Status: ${escapeHtml(v.status)}. Click to change.">
            ${escapeHtml(v.status)}
          </button>
          <button class="btn btn-danger delete-btn"
                  aria-label="Remove ${escapeHtml(v.name)}">✕</button>
        </li>`;
      })
      .join("");

    this._list
      .querySelectorAll(".status-btn")
      .forEach((btn) =>
        btn.addEventListener("click", () =>
          this._cycleStatus(btn.closest(".item-card").dataset.id),
        ),
      );
    this._list
      .querySelectorAll(".delete-btn")
      .forEach((btn) =>
        btn.addEventListener("click", () =>
          this._delete(btn.closest(".item-card").dataset.id),
        ),
      );
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new VendorManager().init();
});
