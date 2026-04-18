/**
 * @file routes/auth.js
 */

'use strict';

const { Router } = require('express');
const { body }   = require('express-validator');

const ctrl             = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { authLimiter }  = require('../middleware/rateLimiter');
const validate         = require('../middleware/validate');

const router = Router();

/* ── Validation chains ──────────────────────────────────────── */
const registerRules = [
  body('email')
    .isEmail().withMessage('A valid email is required')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter')
    .matches(/[0-9]/).withMessage('Password must contain a number'),
  body('displayName')
    .optional()
    .trim()
    .isLength({ max: 80 }).withMessage('Display name must be 80 characters or fewer'),
];

const loginRules = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
];

const updateRules = [
  body('displayName')
    .optional().trim().isLength({ max: 80 }),
  body('weddingDate')
    .optional({ nullable: true })
    .isISO8601().withMessage('Wedding date must be a valid date (YYYY-MM-DD)'),
];

const passwordRules = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
];

/* ── Public routes ──────────────────────────────────────────── */
router.post('/register', authLimiter, registerRules, validate, ctrl.register);
router.post('/login',    authLimiter, loginRules,    validate, ctrl.login);

/* ── Protected routes ───────────────────────────────────────── */
router.get('/me',    authenticate, ctrl.getMe);
router.patch('/me',  authenticate, updateRules,   validate, ctrl.updateMe);
router.post('/me/password', authenticate, passwordRules, validate, ctrl.changePassword);

module.exports = router;
