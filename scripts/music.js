/**
 * @file scripts/music.js
 * @description MusicManager — iTunes search via API proxy + playlist CRUD.
 */

import api, { Auth }                               from './api.js';
import { initNav, Toast, escapeHtml, showLoading } from './main.js';

Auth.requireAuth();

class MusicManager {
  constructor() {
    this._searchInput   = document.getElementById('music-search-input');
    this._sectionSelect = document.getElementById('music-section-select');
    this._searchBtn     = document.getElementById('music-search-btn');
    this._resultsEl     = document.getElementById('music-results');
    this._playlistEl    = document.getElementById('playlist-container');
    this._emptyState    = document.getElementById('playlist-empty');
  }

  async init() {
    initNav();
    this._bindEvents();
    await this._loadPlaylists();
  }

  _bindEvents() {
    this._searchBtn.addEventListener('click', () => this._search());
    this._searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._search();
    });
  }

  /* ── iTunes search (proxied) ──────────────────────────── */
  async _search() {
    const q = this._searchInput.value.trim();
    if (!q) return Toast.show('Enter a song or artist to search.', 'error');

    this._resultsEl.innerHTML = `
      <div class="loading-state">
        <span class="spinner" aria-hidden="true"></span> Searching iTunes…
      </div>`;

    try {
      const { data } = await api.get('/music/search', { q, limit: 12 });
      const tracks = data.results ?? [];

      if (!tracks.length) {
        this._resultsEl.innerHTML = `
          <p style="color:var(--text-muted);padding:12px 0">
            No results found for "${escapeHtml(q)}".
          </p>`;
        return;
      }

      const section = this._sectionSelect.value;
      this._resultsEl.innerHTML = `
        <div class="music-results" role="list" aria-label="Search results">
          ${tracks.map((t) => this._trackCard(t, section)).join('')}
        </div>`;

      this._resultsEl.querySelectorAll('.add-track-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const card = btn.closest('[data-track-id]');
          this._addTrack({
            section:    section,
            trackId:    card.dataset.trackId,
            trackName:  card.dataset.trackName,
            artistName: card.dataset.artistName,
            artworkUrl: card.dataset.artwork  || undefined,
            previewUrl: card.dataset.preview  || undefined,
          });
        });
      });
    } catch (err) {
      this._resultsEl.innerHTML = `
        <p style="color:var(--danger);padding:12px 0">
          Search failed. Please check your connection and try again.
        </p>`;
    }
  }

  _trackCard(track, section) {
    const art = track.artworkUrl60 || '';
    return `
      <div class="music-result-card" role="listitem"
           data-track-id="${escapeHtml(String(track.trackId))}"
           data-track-name="${escapeHtml(track.trackName || '')}"
           data-artist-name="${escapeHtml(track.artistName || '')}"
           data-artwork="${escapeHtml(art)}"
           data-preview="${escapeHtml(track.previewUrl || '')}">
        ${art
          ? `<img class="music-artwork" src="${escapeHtml(art)}"
                  alt="${escapeHtml(track.trackName)} artwork" loading="lazy" />`
          : `<div class="music-artwork" style="background:var(--surface-2);display:flex;
                  align-items:center;justify-content:center;font-size:1.3rem" aria-hidden="true">🎵</div>`
        }
        <div class="music-info">
          <div class="music-title">${escapeHtml(track.trackName || 'Unknown')}</div>
          <div class="music-artist">${escapeHtml(track.artistName || 'Unknown Artist')}</div>
        </div>
        <button class="btn btn-primary add-track-btn"
                style="padding:6px 12px;font-size:.8rem;white-space:nowrap;"
                aria-label="Add ${escapeHtml(track.trackName)} to ${escapeHtml(section)}">
          + Add
        </button>
      </div>`;
  }

  /* ── Add track ────────────────────────────────────────── */
  async _addTrack(payload) {
    try {
      await api.post('/music/tracks', payload);
      Toast.show(`Added to ${payload.section}!`, 'success');
      await this._loadPlaylists();
    } catch (err) {
      if (err.status === 409) return Toast.show(`Already in ${payload.section}.`);
      Toast.show(err.message || 'Could not add track.', 'error');
    }
  }

  /* ── Remove track ─────────────────────────────────────── */
  async _removeTrack(id) {
    try {
      await api.delete(`/music/tracks/${id}`);
      Toast.show('Track removed.');
      await this._loadPlaylists();
    } catch (err) {
      Toast.show(err.message || 'Could not remove track.', 'error');
    }
  }

  /* ── Load & render playlists ──────────────────────────── */
  async _loadPlaylists() {
    try {
      const { data } = await api.get('/music');
      this._renderPlaylists(data.playlists, data.sections);
    } catch (err) {
      Toast.show('Could not load playlists.', 'error');
    }
  }

  _renderPlaylists(playlists, sections) {
    const total = Object.values(playlists).reduce((s, a) => s + a.length, 0);
    this._emptyState.hidden = total > 0;

    this._playlistEl.innerHTML = sections.map((section) => {
      const tracks = playlists[section] ?? [];
      if (!tracks.length) return '';

      const slug = section.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      return `
        <div class="playlist-section card" aria-labelledby="sec-${slug}">
          <div class="playlist-section-header">
            <h3 class="card-title" id="sec-${slug}" style="border:none;padding:0;margin:0;">
              🎵 ${escapeHtml(section)}
              <span style="font-size:.85rem;font-weight:400;color:var(--text-muted)">
                (${tracks.length} song${tracks.length !== 1 ? 's' : ''})
              </span>
            </h3>
          </div>
          <ul class="item-list" aria-label="${escapeHtml(section)} playlist">
            ${tracks.map((t) => `
              <li class="item-card music-result-card" data-id="${escapeHtml(t.id)}" style="gap:10px">
                ${t.artwork_url
                  ? `<img class="music-artwork" src="${escapeHtml(t.artwork_url)}"
                          alt="${escapeHtml(t.track_name)} artwork" loading="lazy" />`
                  : `<div class="music-artwork" style="background:var(--surface-2);
                          display:flex;align-items:center;justify-content:center;
                          font-size:1.2rem" aria-hidden="true">🎵</div>`
                }
                <div class="music-info">
                  <div class="music-title" style="font-size:.9rem">
                    ${escapeHtml(t.track_name || 'Unknown')}
                  </div>
                  <div class="music-artist">${escapeHtml(t.artist_name || '')}</div>
                </div>
                ${t.preview_url
                  ? `<a href="${escapeHtml(t.preview_url)}" target="_blank" rel="noopener noreferrer"
                        class="btn btn-ghost" style="padding:4px 10px;font-size:.78rem"
                        aria-label="Preview ${escapeHtml(t.track_name)}">▶ Preview</a>`
                  : ''
                }
                <button class="btn btn-danger remove-track-btn"
                        aria-label="Remove ${escapeHtml(t.track_name)}">✕</button>
              </li>`
            ).join('')}
          </ul>
        </div>`;
    }).join('');

    this._playlistEl.querySelectorAll('.remove-track-btn').forEach((btn) =>
      btn.addEventListener('click', () =>
        this._removeTrack(btn.closest('[data-id]').dataset.id),
      ),
    );
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new MusicManager().init();
});
