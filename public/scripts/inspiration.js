/**
 * @file scripts/inspiration.js
 */

import api, { Auth } from "./api.js";
import { initNav, Toast, escapeHtml, t } from "./main.js";

Auth.requireAuth();

class InspirationManager {
  constructor() {
    this._searchInput = document.getElementById("inspo-search-input");
    this._searchBtn = document.getElementById("inspo-search-btn");
    this._resultsEl = document.getElementById("inspo-results");
    this._savedGrid = document.getElementById("saved-grid");
    this._savedCount = document.getElementById("saved-count");
    this._emptyState = document.getElementById("board-empty");
  }

  async init() {
    initNav();
    this._bindEvents();
    await this._loadBoard();
  }

  _bindEvents() {
    this._searchBtn.addEventListener("click", () => this._search());
    this._searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        this._search();
      }
    });

    document.querySelectorAll(".suggestion-btn").forEach((btn) =>
      btn.addEventListener("click", () => {
        this._searchInput.value = btn.dataset.q;
        this._search();
      }),
    );
  }

  async _search() {
    const q = this._searchInput.value.trim();
    if (!q) {
      return Toast.show(t("err.searchInspoRequired"), "error");
    }

    this._resultsEl.innerHTML = `
      <div class="loading-state">
        <span class="spinner" aria-hidden="true"></span> ${t("inspiration.searching")}
      </div>`;

    try {
      const { data } = await api.get("/inspiration/search", {
        q,
        per_page: 18,
      });
      const photos = data.results ?? [];

      if (!photos.length) {
        this._resultsEl.innerHTML = `
          <p style="color:var(--text-muted);padding:12px 0">
            ${t("inspiration.noResults", { q: escapeHtml(q) })}
          </p>`;
        return;
      }

      this._resultsEl.innerHTML = `
        <div class="inspo-grid" role="list" aria-label="Search results" style="margin-top:16px">
          ${photos.map((p) => this._resultCard(p)).join("")}
        </div>`;

      this._resultsEl.querySelectorAll(".inspo-save-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const card = btn.closest("[data-photo-id]");
          this._save({
            photoId: card.dataset.photoId,
            thumbUrl: card.dataset.thumb,
            fullUrl: card.dataset.full,
            altDesc: card.dataset.alt || undefined,
            sourceLink: card.dataset.link || undefined,
          });
        });
      });
    } catch {
      this._resultsEl.innerHTML = `
        <p style="color:var(--danger);padding:12px 0">
          ${t("inspiration.searchFailed")}
        </p>`;
    }
  }

  _resultCard(p) {
    const thumb = p.urls?.thumb || "";
    const full = p.urls?.regular || p.urls?.full || thumb;
    const alt =
      p.alt_description || p.description || "Wedding inspiration photo";
    const link = p.links?.html || "#";

    return `
      <div class="inspo-card" role="listitem"
           data-photo-id="${escapeHtml(p.id)}"
           data-thumb="${escapeHtml(thumb)}"
           data-full="${escapeHtml(full)}"
           data-alt="${escapeHtml(alt)}"
           data-link="${escapeHtml(link)}">
        <img src="${escapeHtml(thumb)}" alt="${escapeHtml(alt)}" loading="lazy" />
        <div class="inspo-overlay">
          <button class="inspo-save-btn" aria-label="${t("inspiration.saveBtn")}: ${escapeHtml(alt)}">
            ${t("inspiration.saveBtn")}
          </button>
        </div>
      </div>`;
  }

  async _save(photo) {
    try {
      await api.post("/inspiration", photo);
      Toast.show(t("toast.photoSaved"), "success");
      await this._loadBoard();
    } catch (err) {
      if (err.status === 409) {
        return Toast.show(t("toast.photoDupe"));
      }
      Toast.show(err.message || t("err.loadBoard"), "error");
    }
  }

  async _remove(id) {
    try {
      await api.delete(`/inspiration/${id}`);
      Toast.show(t("toast.photoRemoved"));
      await this._loadBoard();
    } catch (err) {
      Toast.show(err.message || t("err.loadBoard"), "error");
    }
  }

  async _loadBoard() {
    try {
      const { data } = await api.get("/inspiration");
      this._renderBoard(data.photos);
    } catch {
      Toast.show(t("err.loadBoard"), "error");
    }
  }

  _renderBoard(photos) {
    this._emptyState.hidden = photos.length > 0;
    this._savedCount.textContent = photos.length
      ? `(${photos.length} saved)`
      : "";

    this._savedGrid.innerHTML = photos
      .map(
        (p) => `
      <div class="inspo-card" data-id="${escapeHtml(p.id)}"
           role="img" aria-label="${escapeHtml(p.alt_desc || "Saved inspiration image")}">
        <a href="${escapeHtml(p.full_url)}" target="_blank" rel="noopener noreferrer"
           aria-label="View full size: ${escapeHtml(p.alt_desc || "photo")}">
          <img src="${escapeHtml(p.thumb_url)}"
               alt="${escapeHtml(p.alt_desc || "Saved inspiration image")}" loading="lazy" />
        </a>
        <button class="inspo-remove-btn remove-saved-btn"
                aria-label="${t("common.remove")}">✕</button>
      </div>`,
      )
      .join("");

    this._savedGrid
      .querySelectorAll(".remove-saved-btn")
      .forEach((btn) =>
        btn.addEventListener("click", () =>
          this._remove(btn.closest("[data-id]").dataset.id),
        ),
      );
  }
}

document.addEventListener("DOMContentLoaded", () =>
  new InspirationManager().init(),
);
