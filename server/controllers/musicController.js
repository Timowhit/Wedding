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
    console.error("Spotify not configured: missing client ID/secret");
    return null;
  }

  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  try {
    const resp = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${creds}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("Spotify token error:", {
        status: resp.status,
        body: errText,
      });
      return null;
    }

    const data = await resp.json();

    _spotifyToken = data.access_token;
    _spotifyTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;

    return _spotifyToken;
  } catch (err) {
    console.error("Spotify token fetch failed:", err);
    return null;
  }
}

/* ── Helper: fetch with retry on 401 ─────────────────────────── */
async function fetchSpotify(url, token) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    let resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });

    if (resp.status === 401) {
      // Token expired → refresh + retry once
      console.warn("Spotify token expired, refreshing...");
      _spotifyToken = null;

      const newToken = await getSpotifyToken();
      if (!newToken) {
        throw ApiError.internal("Failed to refresh Spotify token");
      }

      resp = await fetch(url, {
        headers: { Authorization: `Bearer ${newToken}` },
      });
    }

    return resp;
  } catch (err) {
    if (err.name === "AbortError") {
      throw ApiError.internal("Spotify request timed out");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
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
      "Spotify is not configured or token could not be retrieved."
    );
  }

  const parsedLimit = parseInt(limit, 10);

  const safeLimit =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, 25)
      : 12; // default fallback

  console.log("Raw limit:", limit);
  console.log("Parsed limit:", parsedLimit);
  console.log("Safe limit:", safeLimit);
  console.log("FINAL SPOTIFY URL:");
  console.log(`https://api.spotify.com/v1/search?${params.toString()}`);
  const params = new URLSearchParams({
    q: q.trim(),
    type: "track",
    limit: String(safeLimit),
  });

  const url = `https://api.spotify.com/v1/search?${params}`;

  const resp = await fetchSpotify(url, token);

  if (!resp.ok) {
    const errorBody = await resp.text();

    console.error("Spotify API error:", {
      status: resp.status,
      body: errorBody,
      query: q,
    });

    if (resp.status === 400) {
      throw ApiError.badRequest("Invalid Spotify search query");
    }

    if (resp.status === 401) {
      throw ApiError.unauthorized("Spotify authentication failed");
    }

    if (resp.status === 429) {
      throw ApiError.tooManyRequests("Spotify rate limit hit");
    }

    throw ApiError.internal(`Spotify API failed (${resp.status})`);
  }

  const data = await resp.json();

  const results = (data.tracks?.items ?? []).map((t) => ({
    spotifyId: t.id,
    trackName: t.name,
    artistName: t.artists.map((a) => a.name).join(", "),
    artworkUrl:
      t.album.images?.[1]?.url ??
      t.album.images?.[0]?.url ??
      "",
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
      `Invalid section. Valid sections: ${Music.SECTIONS.join(", ")}`
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
      `Invalid section. Valid sections: ${Music.SECTIONS.join(", ")}`
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