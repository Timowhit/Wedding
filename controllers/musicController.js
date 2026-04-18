/**
 * @file controllers/musicController.js
 * @description Manage playlist tracks; proxy iTunes search server-side.
 */

'use strict';

const Music        = require('../models/Music');
const ApiError     = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendCreated, sendNoContent } = require('../utils/response');

/* ── iTunes proxy (keeps API calls off the client) ─────────── */
const searchItunes = asyncHandler(async (req, res) => {
  const { q, limit = 12 } = req.query;
  if (!q?.trim()) throw ApiError.badRequest('Query parameter "q" is required');

  const params = new URLSearchParams({
    term:   q.trim(),
    entity: 'song',
    media:  'music',
    limit:  String(Math.min(Number(limit), 25)),
  });

  const resp = await fetch(`https://itunes.apple.com/search?${params}`);
  if (!resp.ok) throw ApiError.internal('iTunes API unavailable');

  const data = await resp.json();
  sendSuccess(res, { results: data.results ?? [] });
});

/* ── Get all playlists (grouped) ────────────────────────────── */
const getPlaylists = asyncHandler(async (req, res) => {
  const playlists = await Music.findAllGrouped(req.user.id);
  sendSuccess(res, { playlists, sections: Music.SECTIONS });
});

/* ── Get a single section ───────────────────────────────────── */
const getSection = asyncHandler(async (req, res) => {
  const { section } = req.params;
  if (!Music.SECTIONS.includes(section)) {
    throw ApiError.badRequest(`Invalid section. Valid sections: ${Music.SECTIONS.join(', ')}`);
  }
  const tracks = await Music.findBySection(req.user.id, section);
  sendSuccess(res, { section, tracks });
});

/* ── Add track to section ───────────────────────────────────── */
const addTrack = asyncHandler(async (req, res) => {
  const { section, trackId, trackName, artistName, artworkUrl, previewUrl } = req.body;

  if (!Music.SECTIONS.includes(section)) {
    throw ApiError.badRequest(`Invalid section. Valid sections: ${Music.SECTIONS.join(', ')}`);
  }

  const track = await Music.create(req.user.id, {
    section, trackId, trackName, artistName, artworkUrl, previewUrl,
  });

  if (!track) throw ApiError.conflict('Track already exists in that section');
  sendCreated(res, { track });
});

/* ── Remove track ───────────────────────────────────────────── */
const removeTrack = asyncHandler(async (req, res) => {
  const deleted = await Music.delete(req.params.id, req.user.id);
  if (!deleted) throw ApiError.notFound('Track not found');
  sendNoContent(res);
});

/* ── Clear an entire section ────────────────────────────────── */
const clearSection = asyncHandler(async (req, res) => {
  const { section } = req.params;
  if (!Music.SECTIONS.includes(section)) {
    throw ApiError.badRequest('Invalid section name');
  }
  const count = await Music.deleteBySection(req.user.id, section);
  sendSuccess(res, { deleted: count });
});

module.exports = { searchItunes, getPlaylists, getSection, addTrack, removeTrack, clearSection };
