/**
 * @file controllers/checklistController.js
 * @description CRUD for checklist tasks, including bulk seed.
 */

'use strict';

const Checklist    = require('../models/Checklist');
const ApiError     = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendCreated, sendNoContent } = require('../utils/response');

const SEED_TASKS = [
  { text: 'Book the venue',            category: 'Venue' },
  { text: 'Choose a caterer',          category: 'Catering' },
  { text: 'Order wedding dress',        category: 'Attire' },
  { text: 'Book the photographer',      category: 'Photography' },
  { text: 'Send save-the-date cards',   category: 'Invitations' },
  { text: 'Book hair & makeup artist',  category: 'Beauty' },
  { text: 'Choose wedding flowers',     category: 'Flowers' },
  { text: 'Book honeymoon travel',      category: 'Honeymoon' },
  { text: 'Finalise guest list',        category: 'Other' },
  { text: 'Arrange transportation',     category: 'Other' },
];

/* ── List tasks ─────────────────────────────────────────────── */
const listTasks = asyncHandler(async (req, res) => {
  const { category, status } = req.query;
  const tasks = await Checklist.findAll(req.user.id, { category, status });

  const total = tasks.length;
  const done  = tasks.filter((t) => t.done).length;

  sendSuccess(res, {
    tasks,
    progress: {
      total,
      done,
      pct: total ? Math.round((done / total) * 100) : 0,
    },
  });
});

/* ── Get single task ────────────────────────────────────────── */
const getTask = asyncHandler(async (req, res) => {
  const task = await Checklist.findById(req.params.id, req.user.id);
  if (!task) throw ApiError.notFound('Task not found');
  sendSuccess(res, { task });
});

/* ── Create task ────────────────────────────────────────────── */
const createTask = asyncHandler(async (req, res) => {
  const { text, category, dueDate, sortOrder } = req.body;
  const task = await Checklist.create(req.user.id, { text, category, dueDate, sortOrder });
  sendCreated(res, { task });
});

/* ── Update task (partial) ──────────────────────────────────── */
const updateTask = asyncHandler(async (req, res) => {
  const task = await Checklist.update(req.params.id, req.user.id, req.body);
  if (!task) throw ApiError.notFound('Task not found');
  sendSuccess(res, { task });
});

/* ── Delete task ────────────────────────────────────────────── */
const deleteTask = asyncHandler(async (req, res) => {
  const deleted = await Checklist.delete(req.params.id, req.user.id);
  if (!deleted) throw ApiError.notFound('Task not found');
  sendNoContent(res);
});

/* ── Toggle done ────────────────────────────────────────────── */
const toggleTask = asyncHandler(async (req, res) => {
  const existing = await Checklist.findById(req.params.id, req.user.id);
  if (!existing) throw ApiError.notFound('Task not found');
  const task = await Checklist.update(req.params.id, req.user.id, { done: !existing.done });
  sendSuccess(res, { task });
});

/* ── Bulk seed ──────────────────────────────────────────────── */
const seedTasks = asyncHandler(async (req, res) => {
  const created = await Checklist.bulkCreate(req.user.id, SEED_TASKS);
  sendSuccess(res, { added: created.length, tasks: created });
});

module.exports = { listTasks, getTask, createTask, updateTask, deleteTask, toggleTask, seedTasks };
