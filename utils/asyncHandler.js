/**
 * @file utils/asyncHandler.js
 * @description Wraps async route handlers so unhandled rejections
 * are forwarded to Express's next(err) automatically.
 */

"use strict";

/**
 * @param {Function} fn  Async express handler (req, res, next) => Promise
 * @returns {Function}   Wrapped handler that catches rejections
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
