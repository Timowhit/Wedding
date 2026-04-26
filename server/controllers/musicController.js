/**
 * @file controllers/musicController.js
 * @description Manage playlist tracks; proxy Spotify search server-side.
 */

"use strict";

const Music = require("../models/Music");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const {
  sendSuccess,
  sendCreated,
  sendNoContent,
} = require("../utils/response");

/* ── Spotify client-credentials token cache ─────────────────── */
let _spotifyToken = null;
let _spotifyTokenExpiry = 0;

async function getSpotifyToken() {
  if (_spotifyToken && Date.now() < _spotifyTokenExpiry) {
    return _spotifyToken;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return null;
  }

  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const resp = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!resp.ok) {
    return null;
  }

  const data = await resp.json();
  _spotifyToken = data.access_token;
  // Expire 60 s early to avoid edge-case clock skew
  _spotifyTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return _spotifyToken;
}

/* ── Spotify search proxy ───────────────────────────────────── */
const searchSpotify = asyncHandler(async (req, res) => {
  const { q, limit = 12 } = req.query;
  if (!q?.trim()) {
    throw ApiError.badRequest('Query parameter "q" is required');
  }

  const token = await getSpotifyToken();
  if (!token) {
    throw ApiError.internal(
      "Spotify is not configured on this server. " +
        "Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET.",
    );
  }

  const params = new URLSearchParams({
    q: q.trim(),
    type: "track",
    limit: String(Math.min(Number(limit), 25)),
  });

  const resp = await fetch(`https://api.spotify.com/v1/search?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!resp.ok) {
    if (resp.status === 401) {
      _spotifyToken = null; // force refresh next time
    }
    throw ApiError.internal("Spotify API unavailable");
  }

  const data = await resp.json();

  // Normalise into a consistent shape for the client
  const results = (data.tracks?.items ?? []).map((t) => ({
    spotifyId: t.id,
    trackName: t.name,
    artistName: t.artists.map((a) => a.name).join(", "),
    artworkUrl: t.album.images?.[1]?.url ?? t.album.images?.[0]?.url ?? "",
    albumName: t.album.name,
    durationMs: t.duration_ms,
    embedUrl: `https://open.spotify.com/embed/track/${t.id}?utm_source=generator`,
  }));

  sendSuccess(res, { results });
});

/* ── Get all playlists (grouped) ────────────────────────────── */
const getPlaylists = asyncHandler(async (req, res) => {
  const playlists = await Music.findAllGrouped(req.weddingId);
  sendSuccess(res, { playlists, sections: Music.SECTIONS });
});

/* ── Get a single section ───────────────────────────────────── */
const getSection = asyncHandler(async (req, res) => {
  const { section } = req.params;
  if (!Music.SECTIONS.includes(section)) {
    throw ApiError.badRequest(
      `Invalid section. Valid sections: ${Music.SECTIONS.join(", ")}`,
    );
  }
  const tracks = await Music.findBySection(req.weddingId, section);
  sendSuccess(res, { section, tracks });
});

/* ── Add track to section ───────────────────────────────────── */
const addTrack = asyncHandler(async (req, res) => {
  const { section, trackId, trackName, artistName, artworkUrl, previewUrl } =
    req.body;

  if (!Music.SECTIONS.includes(section)) {
    throw ApiError.badRequest(
      `Invalid section. Valid sections: ${Music.SECTIONS.join(", ")}`,
    );
  }

  const track = await Music.create(req.weddingId, {
    section,
    trackId,
    trackName,
    artistName,
    artworkUrl,
    previewUrl,
  });

  if (!track) {
    throw ApiError.conflict("Track already exists in that section");
  }
  sendCreated(res, { track });
});

/* ── Remove track ───────────────────────────────────────────── */
const removeTrack = asyncHandler(async (req, res) => {
  const deleted = await Music.delete(req.params.id, req.weddingId);
  if (!deleted) {
    throw ApiError.notFound("Track not found");
  }
  sendNoContent(res);
});

/* ── Clear an entire section ────────────────────────────────── */
const clearSection = asyncHandler(async (req, res) => {
  const { section } = req.params;
  if (!Music.SECTIONS.includes(section)) {
    throw ApiError.badRequest("Invalid section name");
  }
  const count = await Music.deleteBySection(req.weddingId, section);
  sendSuccess(res, { deleted: count });
});

module.exports = {
  searchSpotify,
  getPlaylists,
  getSection,
  addTrack,
  removeTrack,
  clearSection,
};