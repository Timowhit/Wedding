/**
 * @file middleware/errorHandler.js
 * @description Central error-handling middleware.
 * Must be registered AFTER all routes: app.use(errorHandler).
 *
 * Distinguishes operational errors (ApiError) from programmer
 * errors and serialises them into the standard envelope.
 */

'use strict';

const logger   = require('../utils/logger');
const ApiError = require('../utils/ApiError');

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  /* ── Validation errors from express-validator ─────────── */
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      message: 'Invalid JSON body',
      errors:  [],
    });
  }

  /* ── Operational API errors (thrown intentionally) ──────── */
  if (err instanceof ApiError) {
    if (err.statusCode >= 500) {
      logger.error(err.message, { stack: err.stack, path: req.path });
    } else {
      logger.warn(err.message, { statusCode: err.statusCode, path: req.path });
    }

    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      errors:  err.errors,
    });
  }

  /* ── JWT errors ─────────────────────────────────────────── */
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ success: false, message: 'Invalid token', errors: [] });
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ success: false, message: 'Token expired', errors: [] });
  }

  /* ── PostgreSQL constraint errors ───────────────────────── */
  if (err.code === '23505') {
    // unique_violation
    return res.status(409).json({
      success: false,
      message: 'A record with that value already exists.',
      errors:  [],
    });
  }
  if (err.code === '23503') {
    // foreign_key_violation
    return res.status(400).json({
      success: false,
      message: 'Related record not found.',
      errors:  [],
    });
  }

  /* ── Unknown / programmer errors ───────────────────────── */
  logger.error('Unhandled error', {
    message: err.message,
    stack:   err.stack,
    path:    req.path,
    method:  req.method,
  });

  const message =
    process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message;

  return res.status(500).json({ success: false, message, errors: [] });
};

module.exports = errorHandler;
