/**
 * @file controllers/inspirationController.js
 * @description Unsplash image search proxy + saved board CRUD.
 * Keeping the Unsplash key server-side prevents key exposure.
 */

"use strict";

const Inspiration = require("../models/Inspiration");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const {
  sendSuccess,
  sendCreated,
  sendNoContent,
} = require("../utils/response");

/* ── Unsplash search proxy ──────────────────────────────────── */
const searchUnsplash = asyncHandler(async (req, res) => {
  const { q, per_page = 18 } = req.query;
  if (!q?.trim()) {
    throw ApiError.badRequest('Query parameter "q" is required');
  }

  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) {
    throw ApiError.internal("Unsplash key not configured");
  }

  const params = new URLSearchParams({
    query: q.trim(),
    per_page: String(Math.min(Number(per_page), 30)),
    client_id: key,
  });

  const resp = await fetch(`https://api.unsplash.com/search/photos?${params}`);
  if (!resp.ok) {
    throw resp.status === 403
      ? ApiError.internal("Unsplash API key is invalid or rate-limited")
      : ApiError.internal("Unsplash API unavailable");
  }

  const data = await resp.json();
  sendSuccess(res, { results: data.results ?? [], total: data.total ?? 0 });
});

/* ── Get saved board ────────────────────────────────────────── */
const getBoard = asyncHandler(async (req, res) => {
  const photos = await Inspiration.findAll(req.weddingId);
  sendSuccess(res, { photos, count: photos.length });
});

/* ── Save photo to board ────────────────────────────────────── */
const savePhoto = asyncHandler(async (req, res) => {
  const { photoId, thumbUrl, fullUrl, altDesc, sourceLink } = req.body;

  const photo = await Inspiration.create(req.weddingId, {
    photoId,
    thumbUrl,
    fullUrl,
    altDesc,
    sourceLink,
  });

  if (!photo) {
    throw ApiError.conflict("Photo is already saved to your board");
  }
  sendCreated(res, { photo });
});

/* ── Remove photo from board ────────────────────────────────── */
const removePhoto = asyncHandler(async (req, res) => {
  const deleted = await Inspiration.delete(req.params.id, req.weddingId);
  if (!deleted) {
    throw ApiError.notFound("Photo not found on your board");
  }
  sendNoContent(res);
});

/* ── Clear entire board ─────────────────────────────────────── */
const clearBoard = asyncHandler(async (req, res) => {
  const count = await Inspiration.deleteAll(req.weddingId);
  sendSuccess(res, { deleted: count });
});

module.exports = {
  searchUnsplash,
  getBoard,
  savePhoto,
  removePhoto,
  clearBoard,
};
