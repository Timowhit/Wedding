/**
 * @file routes/guests.js
 */

'use strict';

const { Router } = require('express');
const { body, param, query } = require('express-validator');

const ctrl             = require('../controllers/guestController');
const { authenticate } = require('../middleware/auth');
const validate         = require('../middleware/validate');

const router = Router();
const RSVP_VALUES = ['Pending', 'Confirmed', 'Declined'];

router.use(authenticate);

router.get('/',
  query('rsvp').optional().isIn(RSVP_VALUES),
  validate,
  ctrl.listGuests,
);

router.get('/:id',
  param('id').isUUID(),
  validate,
  ctrl.getGuest,
);

router.post('/',
  body('name').trim().notEmpty().withMessage('Guest name is required').isLength({ max: 200 }),
  body('rsvp').optional().isIn(RSVP_VALUES),
  body('diet').optional().trim().isLength({ max: 300 }),
  body('plusOne').optional().trim().isLength({ max: 200 }),
  validate,
  ctrl.createGuest,
);

router.patch('/:id',
  param('id').isUUID(),
  body('name').optional().trim().notEmpty().isLength({ max: 200 }),
  body('rsvp').optional().isIn(RSVP_VALUES),
  body('diet').optional({ nullable: true }).trim().isLength({ max: 300 }),
  body('plusOne').optional({ nullable: true }).trim().isLength({ max: 200 }),
  validate,
  ctrl.updateGuest,
);

router.post('/:id/cycle-rsvp',
  param('id').isUUID(),
  validate,
  ctrl.cycleRsvp,
);

router.delete('/:id',
  param('id').isUUID(),
  validate,
  ctrl.deleteGuest,
);

module.exports = router;
