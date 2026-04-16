/**
 * @file music.js
 * @description MusicManager — search the iTunes Search API for songs and
 *              organise them into named playlist sections stored locally.
 *
 * External API: iTunes Search API (Apple)
 *   Endpoint: https://itunes.apple.com/search
 *   Docs:     https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/
 *   Free — no API key required.
 */

import { StorageManager, Toast, escapeHtml, uid, markActiveNav } from './main.js';

/* ============================================================
   iTunesService — thin wrapper around the iTunes Search API
   ============================================================ */
class iTunesService {
  static BASE_URL = 'https://itunes.apple.com/search';

  /**
   * Search for songs matching a query term.
   * @param {string} query
   * @param {number} limit
   * @returns {Promise<Array>}  array of track objects
   */
  static async searchSongs(query, limit = 12) {
    const params = new URLSearchParams({
      term:   query,
      entity: 'song',
      media:  'music',
      limit:  String(limit),
    });

    const resp = await fetch(`${this.BASE_URL}?${params}`);
    if (!resp.ok) throw new Error(`iTunes API error: ${resp.status}`);
    const data = await resp.json();
    return data.results ?? [];
  }
}

/* ============================================================
   MusicManager — playlists stored per section name
   ============================================================ */
class MusicManager {
  static STORAGE_KEY = 'musicPlaylists';

  /** All possible playlist sections in display order. */
  static SECTIONS = [
    'Processional',
    'Ceremony',
    'Cocktail Hour',
    'First Dance',
    'Reception',
    'Last Dance',
  ];

  constructor() {
    // playlists: { [section: string]: Array<{id, trackName, artistName, artworkUrl, previewUrl}> }
    this._playlists = StorageManager.getValue(MusicManager.STORAGE_KEY, {});

    // DOM refs
    this._searchInput    = document.getElementById('music-search-input');
    this._sectionSelect  = document.getElementById('music-section-select');
    this._searchBtn      = document.getElementById('music-search-btn');
    this._resultsEl      = document.getElementById('music-results');
    this._playlistEl     = document.getElementById('playlist-container');
    this._emptyState     = document.getElementById('playlist-empty');
  }

  init() {
    markActiveNav();
    this._bindEvents();
    this._renderPlaylists();
  }

  _bindEvents() {
    this._searchBtn.addEventListener('click', () => this._search());
    this._searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._search();
    });
  }

  /** Fetch songs from iTunes and display results. */
  async _search() {
    const query = this._searchInput.value.trim();
    if (!query) {
      Toast.show('Enter a song or artist to search.', 'error');
      return;
    }

    // Show loading indicator
    this._resultsEl.innerHTML = `<div class="loading-state"><span class="spinner"></span> Searching iTunes…</div>`;

    try {
      const tracks = await iTunesService.searchSongs(query);

      if (!tracks.length) {
        this._resultsEl.innerHTML = `<p style="color:var(--text-muted);font-size:.9rem;padding:12px 0">No results found for "${escapeHtml(query)}".</p>`;
        return;
      }

      const section = this._sectionSelect.value;

      this._resultsEl.innerHTML = `
        <div class="music-results" role="list" aria-label="Search results">
          ${tracks.map((t) => this._trackCardHtml(t, section)).join('')}
        </div>
      `;

      // Bind add buttons
      this._resultsEl.querySelectorAll('.add-track-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const card = btn.closest('[data-track-id]');
          this._addTrack(
            section,
            {
              id:         uid(),
              trackId:    card.dataset.trackId,
              trackName:  card.dataset.trackName,
              artistName: card.dataset.artistName,
              artworkUrl: card.dataset.artwork,
              previewUrl: card.dataset.preview,
            }
          );
        });
      });

    } catch (err) {
      console.error('iTunes API error:', err);
      this._resultsEl.innerHTML = `<p style="color:var(--danger);padding:12px 0">Search failed. Please check your connection and try again.</p>`;
    }
  }

  /**
   * Build HTML for a single iTunes track card.
   * @param {Object} track  iTunes result object
   * @param {string} section  target playlist section
   * @returns {string}
   */
  _trackCardHtml(track, section) {
    const artwork = track.artworkUrl60 || '';
    return `
      <div class="music-result-card" role="listitem"
           data-track-id="${escapeHtml(String(track.trackId))}"
           data-track-name="${escapeHtml(track.trackName || '')}"
           data-artist-name="${escapeHtml(track.artistName || '')}"
           data-artwork="${escapeHtml(artwork)}"
           data-preview="${escapeHtml(track.previewUrl || '')}">
        ${artwork ? `<img class="music-artwork" src="${escapeHtml(artwork)}" alt="${escapeHtml(track.trackName)} album art" loading="lazy" />` : '<div class="music-artwork" style="background:var(--surface-2);display:flex;align-items:center;justify-content:center;font-size:1.3rem;" aria-hidden="true">🎵</div>'}
        <div class="music-info">
          <div class="music-title">${escapeHtml(track.trackName || 'Unknown')}</div>
          <div class="music-artist">${escapeHtml(track.artistName || 'Unknown Artist')}</div>
        </div>
        <button class="btn btn-primary add-track-btn" aria-label="Add ${escapeHtml(track.trackName)} to ${escapeHtml(section)} playlist"
                style="padding:6px 12px;font-size:.8rem;white-space:nowrap;">+ Add</button>
      </div>
    `;
  }

  /**
   * Add a track object to a named playlist section.
   * @param {string} section
   * @param {Object} track
   */
  _addTrack(section, track) {
    if (!this._playlists[section]) this._playlists[section] = [];

    // Prevent exact duplicates by iTunes trackId
    const alreadyAdded = this._playlists[section].some((t) => t.trackId === track.trackId);
    if (alreadyAdded) {
      Toast.show(`"${track.trackName}" is already in ${section}.`);
      return;
    }

    this._playlists[section].push(track);
    this._persist();
    this._renderPlaylists();
    Toast.show(`Added to ${section}!`, 'success');
  }

  /**
   * Remove a track from a section by playlist-entry id.
   * @param {string} section
   * @param {string} id
   */
  _removeTrack(section, id) {
    if (!this._playlists[section]) return;
    this._playlists[section] = this._playlists[section].filter((t) => t.id !== id);
    this._persist();
    this._renderPlaylists();
    Toast.show('Track removed.');
  }

  _persist() {
    StorageManager.setValue(MusicManager.STORAGE_KEY, this._playlists);
  }

  /** Re-render all playlist sections. */
  _renderPlaylists() {
    const totalTracks = Object.values(this._playlists).reduce((s, arr) => s + arr.length, 0);
    this._emptyState.hidden = totalTracks > 0;

    this._playlistEl.innerHTML = MusicManager.SECTIONS.map((section) => {
      const tracks = this._playlists[section] || [];
      if (!tracks.length) return '';

      return `
        <div class="playlist-section card" aria-labelledby="section-${this._slugify(section)}">
          <div class="playlist-section-header">
            <h3 class="card-title" id="section-${this._slugify(section)}" style="border:none;padding:0;margin:0;">
              🎵 ${escapeHtml(section)}
              <span style="font-size:.85rem;font-weight:400;color:var(--text-muted);font-family:'DM Sans',sans-serif;">
                (${tracks.length} song${tracks.length !== 1 ? 's' : ''})
              </span>
            </h3>
          </div>
          <ul class="item-list" aria-label="${escapeHtml(section)} playlist">
            ${tracks.map((t) => `
              <li class="item-card music-result-card" data-id="${escapeHtml(t.id)}" style="gap:10px;">
                ${t.artworkUrl ? `<img class="music-artwork" src="${escapeHtml(t.artworkUrl)}" alt="${escapeHtml(t.trackName)} artwork" loading="lazy" />` : '<div class="music-artwork" style="background:var(--surface-2);display:flex;align-items:center;justify-content:center;font-size:1.2rem;" aria-hidden="true">🎵</div>'}
                <div class="music-info">
                  <div class="music-title" style="font-size:.9rem;">${escapeHtml(t.trackName || 'Unknown')}</div>
                  <div class="music-artist">${escapeHtml(t.artistName || '')}</div>
                </div>
                ${t.previewUrl ? `<a href="${escapeHtml(t.previewUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost" style="padding:4px 10px;font-size:.78rem;" aria-label="Preview ${escapeHtml(t.trackName)}">▶ Preview</a>` : ''}
                <button class="btn btn-danger remove-track-btn" data-section="${escapeHtml(section)}"
                        aria-label="Remove ${escapeHtml(t.trackName)}">✕</button>
              </li>
            `).join('')}
          </ul>
        </div>
      `;
    }).join('');

    // Delegate remove events
    this._playlistEl.querySelectorAll('.remove-track-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const section = btn.dataset.section;
        const id      = btn.closest('[data-id]').dataset.id;
        this._removeTrack(section, id);
      });
    });
  }

  /**
   * Convert a section name to a URL-safe slug for id attributes.
   * @param {string} str
   * @returns {string}
   */
  _slugify(str) {
    return str.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }
}

/* ============================================================
   Bootstrap
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  const manager = new MusicManager();
  manager.init();
});
