/**
 * @file middleware/rateLimiter.js
 * @description express-rate-limit configurations for different
 * route groups.
 */

'use strict';

const rateLimit = require('express-rate-limit');

const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000; // 15 min
const max      = Number(process.env.RATE_LIMIT_MAX)        || 100;

const handler = (_req, res) =>
  res.status(429).json({
    success: false,
    message: 'Too many requests. Please try again later.',
    errors:  [],
  });

/**
 * General API limiter — 100 requests per 15 minutes per IP.
 */
const apiLimiter = rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders:   false,
  handler,
});

/**
 * Stricter limiter for auth endpoints — 10 attempts per 15 minutes.
 */
const authLimiter = rateLimit({
  windowMs,
  max:             10,
  standardHeaders: true,
  legacyHeaders:   false,
  handler,
  skipSuccessfulRequests: true, // don't count successful logins
});

module.exports = { apiLimiter, authLimiter };
