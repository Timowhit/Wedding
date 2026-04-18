/**
 * @file controllers/budgetController.js
 * @description CRUD for budget items and budget limit management.
 */

'use strict';

const Budget       = require('../models/Budget');
const ApiError     = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendCreated, sendNoContent } = require('../utils/response');

/* ── Summary (limit + spent + remaining) ───────────────────── */
const getSummary = asyncHandler(async (req, res) => {
  const [limit, spent] = await Promise.all([
    Budget.getLimit(req.user.id),
    Budget.totalSpent(req.user.id),
  ]);

  sendSuccess(res, {
    limit,
    spent,
    remaining: limit - spent,
    pct: limit > 0 ? Math.min(Math.round((spent / limit) * 100), 100) : 0,
  });
});

/* ── Budget limit ──────────────────────────────────────────── */
const setLimit = asyncHandler(async (req, res) => {
  const { total } = req.body;
  const saved = await Budget.upsertLimit(req.user.id, total);
  sendSuccess(res, { total: saved });
});

/* ── List expense items ─────────────────────────────────────── */
const listItems = asyncHandler(async (req, res) => {
  const { category } = req.query;
  const items = await Budget.findAll(req.user.id, category || null);
  sendSuccess(res, { items });
});

/* ── Create expense item ─────────────────────────────────────── */
const createItem = asyncHandler(async (req, res) => {
  const { name, category, amount } = req.body;
  const item = await Budget.create(req.user.id, { name, category, amount });
  sendCreated(res, { item });
});

/* ── Delete expense item ─────────────────────────────────────── */
const deleteItem = asyncHandler(async (req, res) => {
  const deleted = await Budget.delete(req.params.id, req.user.id);
  if (!deleted) throw ApiError.notFound('Expense not found');
  sendNoContent(res);
});

module.exports = { getSummary, setLimit, listItems, createItem, deleteItem };
