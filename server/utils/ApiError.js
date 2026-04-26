/**
 * @file utils/ApiError.js
 */

"use strict";

class ApiError extends Error {
  constructor(statusCode, message, errors = [], isOperational = true) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = "Bad Request", errors = []) {
    return new ApiError(400, message, errors);
  }

  static unauthorized(message = "Unauthorized") {
    return new ApiError(401, message);
  }

  static forbidden(message = "Forbidden") {
    return new ApiError(403, message);
  }

  static notFound(message = "Not Found") {
    return new ApiError(404, message);
  }

  static conflict(message = "Conflict") {
    return new ApiError(409, message);
  }

  // ← Added: used by expired invite handling
  static gone(message = "Gone") {
    return new ApiError(410, message);
  }

  static unprocessable(message = "Unprocessable Entity", errors = []) {
    return new ApiError(422, message, errors);
  }

  static internal(message = "Internal Server Error") {
    return new ApiError(500, message, [], false);
  }
}

module.exports = ApiError;
