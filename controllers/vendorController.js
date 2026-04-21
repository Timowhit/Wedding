/**
 * @file controllers/vendorController.js
 * @description CRUD + status cycling for wedding vendors.
 */

"use strict";

const Vendor = require("../models/Vendor");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const {
  sendSuccess,
  sendCreated,
  sendNoContent,
} = require("../utils/response");

const STATUS_CYCLE = ["Researching", "Contacted", "Booked", "Declined"];

/* ── List vendors ───────────────────────────────────────────── */
const listVendors = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const vendors = await Vendor.findAll(req.weddingId, status || null);
  sendSuccess(res, { vendors });
});

/* ── Get single vendor ──────────────────────────────────────── */
const getVendor = asyncHandler(async (req, res) => {
  const vendor = await Vendor.findById(req.params.id, req.weddingId);
  if (!vendor) {
    throw ApiError.notFound("Vendor not found");
  }
  sendSuccess(res, { vendor });
});

/* ── Create vendor ──────────────────────────────────────────── */
const createVendor = asyncHandler(async (req, res) => {
  const vendor = await Vendor.create(req.weddingId, req.body);
  sendCreated(res, { vendor });
});

/* ── Update vendor ──────────────────────────────────────────── */
const updateVendor = asyncHandler(async (req, res) => {
  const vendor = await Vendor.update(req.params.id, req.weddingId, req.body);
  if (!vendor) {
    throw ApiError.notFound("Vendor not found");
  }
  sendSuccess(res, { vendor });
});

/* ── Cycle booking status ───────────────────────────────────── */
const cycleStatus = asyncHandler(async (req, res) => {
  const existing = await Vendor.findById(req.params.id, req.weddingId);
  if (!existing) {
    throw ApiError.notFound("Vendor not found");
  }

  const idx = STATUS_CYCLE.indexOf(existing.status);
  const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
  const vendor = await Vendor.update(req.params.id, req.weddingId, {
    status: next,
  });
  sendSuccess(res, { vendor });
});

/* ── Delete vendor ──────────────────────────────────────────── */
const deleteVendor = asyncHandler(async (req, res) => {
  const deleted = await Vendor.delete(req.params.id, req.weddingId);
  if (!deleted) {
    throw ApiError.notFound("Vendor not found");
  }
  sendNoContent(res);
});

module.exports = {
  listVendors,
  getVendor,
  createVendor,
  updateVendor,
  cycleStatus,
  deleteVendor,
};
