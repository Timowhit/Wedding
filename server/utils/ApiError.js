/**
 * @file utils/ApiError.js
 * @description Structured error class for operational (expected) API errors.
 * Throw these from controllers / models; the global error handler will
 * serialise them into consistent JSON responses.
 */

'use strict';

class ApiError extends Error {
  /**
   * @param {number}  statusCode  HTTP status code
   * @param {string}  message     Human-readable message (may be shown to client)
   * @param {Array}   [errors]    Field-level validation errors
   * @param {boolean} [isOperational=true]  false = programmer error (5xx)
   */
  constructor(statusCode, message, errors = [], isOperational = true) {
    super(message);
    this.name         = 'ApiError';
    this.statusCode   = statusCode;
    this.errors       = errors;     // e.g. [{ field: 'email', msg: 'Invalid' }]
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }

  /* ── convenience factories ─────────────────────────────── */

  static badRequest(message = 'Bad Request', errors = []) {
    return new ApiError(400, message, errors);
  }

  static unauthorized(message = 'Unauthorized') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'Forbidden') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Not Found') {
    return new ApiError(404, message);
  }

  static conflict(message = 'Conflict') {
    return new ApiError(409, message);
  }

  static unprocessable(message = 'Unprocessable Entity', errors = []) {
    return new ApiError(422, message, errors);
  }

  static internal(message = 'Internal Server Error') {
    return new ApiError(500, message, [], false);
  }
}

module.exports = ApiError;
