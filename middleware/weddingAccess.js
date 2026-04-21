/**
 * @file middleware/weddingAccess.js
 * @description Resolves req.weddingId / req.weddingRole and enforces role gates.
 *
 * Usage in routes:
 *   router.use(authenticate, resolveWedding);          // sets req.weddingId
 *   router.post('/', requireEditor, ctrl.createItem);  // editors + owners only
 *   router.delete('/', requireOwner, ctrl.delete);     // owners only
 *
 * Multi-wedding support:
 *   Send header  X-Wedding-ID: <uuid>  to select a specific wedding.
 *   Defaults to the user's primary (owner) wedding.
 */

"use strict";

const Wedding = require("../models/Wedding");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

/**
 * Resolve req.weddingId from either:
 *   1. X-Wedding-ID request header  (multi-wedding users)
 *   2. The user's primary wedding   (fallback)
 *
 * Sets:
 *   req.weddingId   — UUID of the active wedding
 *   req.weddingRole — 'owner' | 'editor' | 'viewer'
 */
const resolveWedding = asyncHandler(async (req, _res, next) => {
  const requestedId = req.headers["x-wedding-id"];

  if (requestedId) {
    const membership = await Wedding.getMembership(requestedId, req.user.id);
    if (!membership) {
      throw ApiError.forbidden("You are not a member of that wedding");
    }
    req.weddingId = requestedId;
    req.weddingRole = membership.role;
  } else {
    const wedding = await Wedding.findPrimaryByUser(req.user.id);
    if (!wedding) {
      throw ApiError.notFound(
        "No wedding found. Create one first or accept an invite.",
      );
    }
    req.weddingId = wedding.id;
    req.weddingRole = wedding.role;
  }

  next();
});

/**
 * Require the requesting user to be the wedding owner.
 * Must be used AFTER resolveWedding.
 */
const requireOwner = (req, _res, next) => {
  if (req.weddingRole !== "owner") {
    return next(
      ApiError.forbidden("Only the wedding owner can perform this action"),
    );
  }
  next();
};

/**
 * Require at least editor-level access (owner or editor).
 * Viewers can GET but cannot mutate data.
 * Must be used AFTER resolveWedding.
 */
const requireEditor = (req, _res, next) => {
  if (req.weddingRole === "viewer") {
    return next(
      ApiError.forbidden(
        "You have view-only access to this wedding. Ask the owner to upgrade your role.",
      ),
    );
  }
  next();
};

module.exports = { resolveWedding, requireOwner, requireEditor };
