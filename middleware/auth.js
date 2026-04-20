/**
 * @file middleware/auth.js
 * @description Protects routes by verifying the Bearer JWT
 * in the Authorization header and attaching the decoded user
 * to req.user.
 */

"use strict";

const { verifyToken } = require("../utils/jwt");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { query } = require("../db");

/**
 * Require a valid JWT.  Populates req.user = { id, email }.
 */
const authenticate = asyncHandler(async (req, _res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    throw ApiError.unauthorized("No token provided");
  }

  const token = authHeader.slice(7);
  const decoded = verifyToken(token); // throws on invalid/expired

  // Confirm user still exists (guards against deleted accounts)
  const { rows } = await query(
    "SELECT id, email, display_name FROM users WHERE id = $1",
    [decoded.id],
  );

  if (!rows.length) {
    throw ApiError.unauthorized("User no longer exists");
  }

  req.user = rows[0];
  next();
});

/**
 * Optionally populate req.user if a valid token is present,
 * but do NOT reject the request if no token is provided.
 * Useful for routes that behave differently for authenticated users.
 */
const optionalAuth = asyncHandler(async (req, _res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {return next();}

  try {
    const token = authHeader.slice(7);
    const decoded = verifyToken(token);
    const { rows } = await query(
      "SELECT id, email, display_name FROM users WHERE id = $1",
      [decoded.id],
    );
    if (rows.length) {req.user = rows[0];}
  } catch {
    // swallow — treat as unauthenticated
  }
  next();
});

module.exports = { authenticate, optionalAuth };
