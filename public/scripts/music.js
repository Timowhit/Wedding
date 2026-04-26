/**
 * @file scripts/music.js
 */

import api, { Auth } from "./api.js";
import { initNav, Toast, escapeHtml, t } from "./main.js";

Auth.requireAuth();

/** Spotify track IDs are 22-char base-62 strings. */
const isSpotifyId = (id) => /^[A-Za-z0-9]{22}$/.test(String(id ?? ""));

class MusicManager {
  constructor() {
    this._searchInput = document.getElementById("music-search-input");
    this._sectionSelect = document.getElementById("music-section-select");
    this._searchBtn = document.getElementById("music-search-btn");
    this._resultsEl = document.getElementById("music-results");
    this._playlistEl = document.getElementById("playlist-container");
    this._emptyState = document.getElementById("playlist-empty");
  }

  async init() {
    initNav();
    this._bindEvents();
    await this._loadPlaylists();
  }

  _bindEvents() {
    this._searchBtn.addEventListener("click", () => this._search());
    this._searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {this._search();}
    });
  }

  /* ── Search ─────────────────────────────────────────────── */

  async _search() {
    const q = this._searchInput.value.trim();
    if (!q) {return Toast.show(t("err.searchRequired"), "error");}

    this._resultsEl.innerHTML = `
      <div class="loading-state">
        <span class="spinner" aria-hidden="true"></span> ${t("music.searching")}
      </div>`;

    try {
      const { data } = await api.get("/music/search", { q, limit: 12 });
      const tracks = data.results ?? [];

      if (!tracks.length) {
        this._resultsEl.innerHTML = `
          <p style="color:var(--text-muted);padding:12px 0">
            ${t("music.noResults", { q: escapeHtml(q) })}
          </p>`;
        return;
      }

      const section = this._sectionSelect.value;
      this._resultsEl.innerHTML = `
        <div class="music-results" role="list" aria-label="Search results">
          ${tracks.map((tr) => this._searchCard(tr, section)).join("")}
        </div>`;

      this._resultsEl.querySelectorAll(".add-track-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const card = btn.closest("[data-spotify-id]");
          this._addTrack({
            section,
            trackId: card.dataset.spotifyId,
            trackName: card.dataset.trackName,
            artistName: card.dataset.artistName,
            artworkUrl: card.dataset.artwork || undefined,
            // store embed URL in previewUrl column for playlist rendering
            previewUrl: `https://open.spotify.com/embed/track/${card.dataset.spotifyId}?utm_source=generator`,
          });
        });
      });

      // Preview buttons inside search results
      this._resultsEl.querySelectorAll(".preview-toggle-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const card = btn.closest("[data-spotify-id]");
          this._toggleEmbed(card, card.dataset.spotifyId, btn);
        });
      });
    } catch {
      this._resultsEl.innerHTML = `
        <p style="color:var(--danger);padding:12px 0">
          ${t("music.searchFailed")}
        </p>`;
    }
  }

  _searchCard(track, section) {
    const art = track.artworkUrl || "";
    const mins = Math.floor((track.durationMs ?? 0) / 60000);
    const secs = String(Math.floor(((track.durationMs ?? 0) % 60000) / 1000)).padStart(2, "0");
    const dur = track.durationMs ? `${mins}:${secs}` : "";

    return `
      <div class="music-result-card" role="listitem"
           data-spotify-id="${escapeHtml(track.spotifyId)}"
           data-track-name="${escapeHtml(track.trackName || "")}"
           data-artist-name="${escapeHtml(track.artistName || "")}"
           data-artwork="${escapeHtml(art)}">
        ${
          art
            ? `<img class="music-artwork" src="${escapeHtml(art)}"
                    alt="${escapeHtml(track.trackName)} artwork" loading="lazy" />`
            : `<div class="music-artwork music-artwork-placeholder" aria-hidden="true">🎵</div>`
        }
        <div class="music-info">
          <div class="music-title">${escapeHtml(track.trackName || "Unknown")}</div>
          <div class="music-artist">${escapeHtml(track.artistName || "Unknown Artist")}</div>
          ${dur ? `<div class="music-duration">${escapeHtml(dur)}</div>` : ""}
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;">
          <button class="btn btn-ghost preview-toggle-btn"
                  style="padding:6px 10px;font-size:.78rem;white-space:nowrap;"
                  aria-label="Preview ${escapeHtml(track.trackName)}">
            ▶ Preview
          </button>
          <button class="btn btn-primary add-track-btn"
                  style="padding:6px 12px;font-size:.8rem;white-space:nowrap;"
                  aria-label="${t("music.addBtn")} ${escapeHtml(track.trackName)} to ${escapeHtml(section)}">
            ${t("music.addBtn")}
          </button>
        </div>
        <div class="spotify-embed-slot" style="display:none;width:100%;margin-top:8px;grid-column:1/-1;"></div>
      </div>`;
  }

  /* ── Spotify embed toggle ───────────────────────────────── */

  _toggleEmbed(card, spotifyId, btn) {
    const slot = card.querySelector(".spotify-embed-slot");
    if (!slot) {return;}

    const isOpen = slot.style.display !== "none";

    if (isOpen) {
      slot.style.display = "none";
      slot.innerHTML = "";
      btn.textContent = "▶ Preview";
      card.style.flexWrap = "wrap";
    } else {
      slot.style.display = "block";
      slot.innerHTML = `
        <iframe
          style="border-radius:10px;display:block;"
          src="https://open.spotify.com/embed/track/${escapeHtml(spotifyId)}?utm_source=generator"
          width="100%" height="80"
          frameBorder="0"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
          title="Spotify preview">
        </iframe>`;
      btn.textContent = "✕ Close";
      card.style.flexWrap = "wrap";
    }
  }

  /* ── Add / remove tracks ────────────────────────────────── */

  async _addTrack(payload) {
    try {
      await api.post("/music/tracks", payload);
      Toast.show(t("toast.trackAdded", { section: payload.section }), "success");
      await this._loadPlaylists();
    } catch (err) {
      if (err.status === 409) {
        return Toast.show(t("toast.trackDupe", { section: payload.section }));
      }
      Toast.show(err.message || t("err.loadPlaylists"), "error");
    }
  }

  async _removeTrack(id) {
    try {
      await api.delete(`/music/tracks/${id}`);
      Toast.show(t("toast.trackRemoved"));
      await this._loadPlaylists();
    } catch (err) {
      Toast.show(err.message || t("err.loadPlaylists"), "error");
    }
  }

  /* ── Playlists ──────────────────────────────────────────── */

  async _loadPlaylists() {
    try {
      const { data } = await api.get("/music");
      this._renderPlaylists(data.playlists, data.sections);
    } catch {
      Toast.show(t("err.loadPlaylists"), "error");
    }
  }

  _renderPlaylists(playlists, sections) {
    const total = Object.values(playlists).reduce((s, a) => s + a.length, 0);
    this._emptyState.hidden = total > 0;

    this._playlistEl.innerHTML = sections
      .map((section) => {
        const tracks = playlists[section] ?? [];
        if (!tracks.length) {return "";}

        const slug = section
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9-]/g, "");

        return `
        <div class="playlist-section card" aria-labelledby="sec-${slug}">
          <div class="playlist-section-header">
            <h3 class="card-title" id="sec-${slug}"
                style="border:none;padding:0;margin:0;">
              🎵 ${escapeHtml(section)}
              <span style="font-size:.85rem;font-weight:400;color:var(--text-muted)">
                (${tracks.length} song${tracks.length !== 1 ? "s" : ""})
              </span>
            </h3>
          </div>
          <ul class="item-list" aria-label="${escapeHtml(section)} playlist">
            ${tracks.map((tr) => this._playlistTrackHtml(tr)).join("")}
          </ul>
        </div>`;
      })
      .join("");

    // Wire remove buttons
    this._playlistEl
      .querySelectorAll(".remove-track-btn")
      .forEach((btn) =>
        btn.addEventListener("click", () =>
          this._removeTrack(btn.closest("[data-id]").dataset.id),
        ),
      );

    // Wire embed-toggle buttons on saved tracks
    this._playlistEl
      .querySelectorAll(".playlist-preview-btn")
      .forEach((btn) => {
        btn.addEventListener("click", () => {
          const li = btn.closest("[data-id]");
          const spotifyId = li.dataset.spotifyId;
          this._toggleEmbed(li, spotifyId, btn);
        });
      });
  }

  _playlistTrackHtml(tr) {
    // preview_url is either a Spotify embed URL (new tracks) or blank (old iTunes tracks)
    const embedUrl = tr.preview_url ?? "";
    const spotifyId = embedUrl.match(/track\/([A-Za-z0-9]{22})/)?.[1] ?? "";
    const canEmbed = Boolean(spotifyId) || isSpotifyId(tr.track_id);
    const resolvedId = spotifyId || (isSpotifyId(tr.track_id) ? tr.track_id : "");

    return `
      <li class="item-card music-result-card" data-id="${escapeHtml(tr.id)}"
          data-spotify-id="${escapeHtml(resolvedId)}"
          style="gap:10px;flex-wrap:wrap;">
        ${
          tr.artwork_url
            ? `<img class="music-artwork" src="${escapeHtml(tr.artwork_url)}"
                    alt="${escapeHtml(tr.track_name)} artwork" loading="lazy" />`
            : `<div class="music-artwork music-artwork-placeholder" aria-hidden="true">🎵</div>`
        }
        <div class="music-info" style="flex:1;min-width:0;">
          <div class="music-title" style="font-size:.9rem">
            ${escapeHtml(tr.track_name || "Unknown")}
          </div>
          <div class="music-artist">${escapeHtml(tr.artist_name || "")}</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;">
          ${
            canEmbed
              ? `<button class="btn btn-ghost playlist-preview-btn"
                         style="padding:4px 10px;font-size:.78rem;white-space:nowrap;"
                         aria-label="Preview ${escapeHtml(tr.track_name)}">
                   ▶ Preview
                 </button>`
              : ""
          }
          <button class="btn btn-danger remove-track-btn"
                  aria-label="${t("common.remove")} ${escapeHtml(tr.track_name)}">✕</button>
        </div>
        <!-- Spotify embed injected here on toggle -->
        <div class="spotify-embed-slot" style="display:none;width:100%;"></div>
      </li>`;
  }
}

document.addEventListener("DOMContentLoaded", () => new MusicManager().init());