/**
 * @file routes/checklist.js
 */

'use strict';

const { Router } = require('express');
const { body, param, query } = require('express-validator');

const ctrl             = require('../controllers/checklistController');
const { authenticate } = require('../middleware/auth');
const validate         = require('../middleware/validate');

const router = Router();

const CATEGORIES = ['Venue','Catering','Attire','Flowers','Photography',
                    'Invitations','Honeymoon','Beauty','Other'];

router.use(authenticate);

/* ── Seed ───────────────────────────────────────────────────── */
router.post('/seed', ctrl.seedTasks);

/* ── List ───────────────────────────────────────────────────── */
router.get('/',
  query('category').optional().isIn(CATEGORIES),
  query('status').optional().isIn(['active', 'done']),
  validate,
  ctrl.listTasks,
);

/* ── Single task ────────────────────────────────────────────── */
router.get('/:id',
  param('id').isUUID(),
  validate,
  ctrl.getTask,
);

/* ── Create ─────────────────────────────────────────────────── */
router.post('/',
  body('text').trim().notEmpty().withMessage('Task text is required').isLength({ max: 500 }),
  body('category').isIn(CATEGORIES).withMessage('Invalid category'),
  body('dueDate').optional({ nullable: true }).isISO8601(),
  body('sortOrder').optional().isInt({ min: 0 }),
  validate,
  ctrl.createTask,
);

/* ── Update (partial) ───────────────────────────────────────── */
router.patch('/:id',
  param('id').isUUID(),
  body('text').optional().trim().notEmpty().isLength({ max: 500 }),
  body('category').optional().isIn(CATEGORIES),
  body('dueDate').optional({ nullable: true }).isISO8601(),
  body('done').optional().isBoolean(),
  validate,
  ctrl.updateTask,
);

/* ── Toggle done ────────────────────────────────────────────── */
router.post('/:id/toggle',
  param('id').isUUID(),
  validate,
  ctrl.toggleTask,
);

/* ── Delete ─────────────────────────────────────────────────── */
router.delete('/:id',
  param('id').isUUID(),
  validate,
  ctrl.deleteTask,
);

module.exports = router;
