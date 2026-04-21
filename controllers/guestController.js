/**
 * @file controllers/guestController.js
 * @description CRUD + RSVP cycling for wedding guests.
 */

"use strict";

const Guest = require("../models/Guest");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const {
  sendSuccess,
  sendCreated,
  sendNoContent,
} = require("../utils/response");

const RSVP_CYCLE = ["Pending", "Confirmed", "Declined"];

/* ── List guests + stats ────────────────────────────────────── */
const listGuests = asyncHandler(async (req, res) => {
  const { rsvp } = req.query;
  const [guests, stats] = await Promise.all([
    Guest.findAll(req.weddingId, rsvp || null),
    Guest.stats(req.weddingId),
  ]);
  sendSuccess(res, { guests, stats });
});

/* ── Get single guest ───────────────────────────────────────── */
const getGuest = asyncHandler(async (req, res) => {
  const guest = await Guest.findById(req.params.id, req.weddingId);
  if (!guest) {
    throw ApiError.notFound("Guest not found");
  }
  sendSuccess(res, { guest });
});

/* ── Create guest ───────────────────────────────────────────── */
const createGuest = asyncHandler(async (req, res) => {
  const { name, rsvp, diet, plusOne } = req.body;
  const guest = await Guest.create(req.weddingId, {
    name,
    rsvp,
    diet,
    plusOne,
  });
  sendCreated(res, { guest });
});

/* ── Update guest ───────────────────────────────────────────── */
const updateGuest = asyncHandler(async (req, res) => {
  const { name, rsvp, diet, plusOne } = req.body;
  const guest = await Guest.update(req.params.id, req.weddingId, {
    name,
    rsvp,
    diet,
    plusOne,
  });
  if (!guest) {
    throw ApiError.notFound("Guest not found");
  }
  sendSuccess(res, { guest });
});

/* ── Cycle RSVP status ──────────────────────────────────────── */
const cycleRsvp = asyncHandler(async (req, res) => {
  const existing = await Guest.findById(req.params.id, req.weddingId);
  if (!existing) {
    throw ApiError.notFound("Guest not found");
  }

  const idx = RSVP_CYCLE.indexOf(existing.rsvp);
  const next = RSVP_CYCLE[(idx + 1) % RSVP_CYCLE.length];

  const guest = await Guest.update(req.params.id, req.weddingId, {
    rsvp: next,
  });
  sendSuccess(res, { guest });
});

/* ── Delete guest ───────────────────────────────────────────── */
const deleteGuest = asyncHandler(async (req, res) => {
  const deleted = await Guest.delete(req.params.id, req.weddingId);
  if (!deleted) {
    throw ApiError.notFound("Guest not found");
  }
  sendNoContent(res);
});

module.exports = {
  listGuests,
  getGuest,
  createGuest,
  updateGuest,
  cycleRsvp,
  deleteGuest,
};
