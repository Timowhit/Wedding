/**
 * @file inspiration.js
 * @description InspirationManager — search Unsplash for wedding imagery
 *              and persist a saved inspiration board to localStorage.
 *
 * External API: Unsplash API
 *   Endpoint: https://api.unsplash.com/search/photos
 *   Docs:     https://unsplash.com/documentation
 *   Key:      DEMO_KEY provides ~50 requests/hour for demos.
 *             Replace CLIENT_ID with your own key for production.
 */

import { StorageManager, Toast, escapeHtml, uid, markActiveNav } from './main.js';

/* ============================================================
   UnsplashService — thin wrapper around the Unsplash Search API
   ============================================================ */
class UnsplashService {
  // Replace with your own Unsplash Access Key for production use.
  static CLIENT_ID = 'UsFchkrUEzUi9-5a_3_kqT9MLpFyLNh7SHEWTTmf5g0';
  static BASE_URL   = 'https://api.unsplash.com/search/photos';

  /**
   * Search for photos by query.
   * @param {string} query
   * @param {number} perPage   number of results (max 30)
   * @returns {Promise<Array>} array of Unsplash photo objects
   */
  static async search(query, perPage = 18) {
    const params = new URLSearchParams({
      query,
      per_page:  String(perPage),
      client_id: this.CLIENT_ID,
    });

    const resp = await fetch(`${this.BASE_URL}?${params}`);
    if (!resp.ok) throw new Error(`Unsplash API error: ${resp.status}`);
    const data = await resp.json();
    return data.results ?? [];
  }
}

/* ============================================================
   InspirationManager — board state and rendering
   ============================================================ */
class InspirationManager {
  static STORAGE_KEY = 'inspirationBoard';

  constructor() {
    /** @type {Array<{id:string, thumbUrl:string, fullUrl:string, altDesc:string, link:string}>} */
    this._saved = StorageManager.getList(InspirationManager.STORAGE_KEY);

    // DOM refs
    this._searchInput = document.getElementById('inspo-search-input');
    this._searchBtn   = document.getElementById('inspo-search-btn');
    this._resultsEl   = document.getElementById('inspo-results');
    this._savedGrid   = document.getElementById('saved-grid');
    this._savedCount  = document.getElementById('saved-count');
    this._emptyState  = document.getElementById('board-empty');
  }

  init() {
    markActiveNav();
    this._bindEvents();
    this._renderBoard();
  }

  _bindEvents() {
    this._searchBtn.addEventListener('click', () => this._search());
    this._searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._search();
    });

    // Quick suggestion buttons
    document.querySelectorAll('.suggestion-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._searchInput.value = btn.dataset.q;
        this._search();
      });
    });
  }

  /** Fetch and display images from Unsplash. */
  async _search() {
    const query = this._searchInput.value.trim();
    if (!query) {
      Toast.show('Enter a search term.', 'error');
      return;
    }

    this._resultsEl.innerHTML = `<div class="loading-state"><span class="spinner"></span> Searching Unsplash…</div>`;

    try {
      const photos = await UnsplashService.search(query);

      if (!photos.length) {
        this._resultsEl.innerHTML = `<p style="color:var(--text-muted);padding:12px 0;">No images found for "${escapeHtml(query)}".</p>`;
        return;
      }

      this._resultsEl.innerHTML = `
        <div class="inspo-grid" role="list" aria-label="Search results" style="margin-top:16px;">
          ${photos.map((p) => this._resultCardHtml(p)).join('')}
        </div>
      `;

      // Bind save buttons
      this._resultsEl.querySelectorAll('.inspo-save-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const card = btn.closest('[data-photo-id]');
          this._savePhoto({
            id:       uid(),
            photoId:  card.dataset.photoId,
            thumbUrl: card.dataset.thumb,
            fullUrl:  card.dataset.full,
            altDesc:  card.dataset.alt,
            link:     card.dataset.link,
          });
        });
      });

    } catch (err) {
      console.error('Unsplash API error:', err);
      this._resultsEl.innerHTML = `<p style="color:var(--danger);padding:12px 0;">Search failed. Please check your connection and try again.</p>`;
    }
  }

  /**
   * Build HTML for a single Unsplash photo result card.
   * @param {Object} photo  Unsplash photo object
   * @returns {string}
   */
  _resultCardHtml(photo) {
    const thumb  = photo.urls?.thumb || '';
    const full   = photo.urls?.regular || photo.urls?.full || thumb;
    const alt    = photo.alt_description || photo.description || 'Wedding inspiration photo';
    const link   = photo.links?.html || '#';

    return `
      <div class="inspo-card" role="listitem"
           data-photo-id="${escapeHtml(photo.id)}"
           data-thumb="${escapeHtml(thumb)}"
           data-full="${escapeHtml(full)}"
           data-alt="${escapeHtml(alt)}"
           data-link="${escapeHtml(link)}">
        <img src="${escapeHtml(thumb)}" alt="${escapeHtml(alt)}" loading="lazy" />
        <div class="inspo-overlay">
          <button class="inspo-save-btn" aria-label="Save: ${escapeHtml(alt)}">
            ♥ Save
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Save a photo to the inspiration board.
   * @param {Object} photo
   */
  _savePhoto(photo) {
    // Prevent duplicates by Unsplash photoId
    const dup = this._saved.some((s) => s.photoId === photo.photoId);
    if (dup) {
      Toast.show('Already saved to your board!');
      return;
    }
    this._saved.push(photo);
    this._persist();
    this._renderBoard();
    Toast.show('Saved to your inspiration board! 🌸', 'success');
  }

  /**
   * Remove a saved photo by board entry id.
   * @param {string} id
   */
  _removePhoto(id) {
    this._saved = this._saved.filter((p) => p.id !== id);
    this._persist();
    this._renderBoard();
    Toast.show('Removed from board.');
  }

  _persist() {
    StorageManager.setList(InspirationManager.STORAGE_KEY, this._saved);
  }

  /** Re-render the saved inspiration board. */
  _renderBoard() {
    this._emptyState.hidden = this._saved.length > 0;
    this._savedCount.textContent = this._saved.length
      ? `(${this._saved.length} saved)`
      : '';

    this._savedGrid.innerHTML = this._saved.map((p) => `
      <div class="inspo-card" data-id="${escapeHtml(p.id)}" role="img" aria-label="${escapeHtml(p.altDesc || 'Saved inspiration image')}">
        <a href="${escapeHtml(p.fullUrl)}" target="_blank" rel="noopener noreferrer"
           aria-label="View full size: ${escapeHtml(p.altDesc || 'photo')}">
          <img src="${escapeHtml(p.thumbUrl)}" alt="${escapeHtml(p.altDesc || 'Saved inspiration image')}" loading="lazy" />
        </a>
        <button class="inspo-remove-btn remove-saved-btn"
                aria-label="Remove from board">✕</button>
      </div>
    `).join('');

    // Delegate remove
    this._savedGrid.querySelectorAll('.remove-saved-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.closest('[data-id]').dataset.id;
        this._removePhoto(id);
      });
    });
  }
}

/* ============================================================
   Bootstrap
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  const manager = new InspirationManager();
  manager.init();
});
