/**
 * @file routes/weddings.js
 * @description Routes for wedding management, members, and invites.
 */

"use strict";

const { Router } = require("express");
const { body, param } = require("express-validator");

const ctrl = require("../controllers/weddingController");
const { authenticate } = require("../middleware/auth");
const { resolveWedding, requireOwner } = require("../middleware/weddingAccess");
const validate = require("../middleware/validate");

const router = Router();

// All routes require authentication
router.use(authenticate);

/* ── Validation chains ──────────────────────────────────────── */
const weddingRules = [
  body("name")
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage("Name must be 100 characters or fewer"),
  body("weddingDate")
    .optional({ nullable: true })
    .isISO8601()
    .withMessage("Wedding date must be a valid date"),
];

const memberRules = [
  body("email").isEmail().normalizeEmail(),
  body("role")
    .optional()
    .isIn(["viewer", "editor", "owner"])
    .withMessage("Role must be viewer, editor, or owner"),
];

const roleUpdateRules = [
  body("role")
    .isIn(["viewer", "editor", "owner"])
    .withMessage("Role must be viewer, editor, or owner"),
];

/* ── Wedding CRUD ───────────────────────────────────────────── */
router.get("/", ctrl.listWeddings);
router.post("/", weddingRules, validate, ctrl.createWedding);
router.get("/:id", param("id").isUUID(), validate, ctrl.getWedding);
router.patch(
  "/:id",
  param("id").isUUID(),
  weddingRules,
  validate,
  requireOwner,
  ctrl.updateWedding,
);

/* ── Members ────────────────────────────────────────────────── */
router.get(
  "/:id/members",
  param("id").isUUID(),
  validate,
  resolveWedding,
  ctrl.listMembers,
);
router.post(
  "/:id/members",
  param("id").isUUID(),
  memberRules,
  validate,
  requireOwner,
  ctrl.addMember,
);
router.patch(
  "/:weddingId/members/:userId",
  param("weddingId").isUUID(),
  param("userId").isUUID(),
  roleUpdateRules,
  validate,
  requireOwner,
  ctrl.updateMemberRole,
);
router.delete(
  "/:weddingId/members/:userId",
  param("weddingId").isUUID(),
  param("userId").isUUID(),
  validate,
  requireOwner,
  ctrl.removeMember,
);

/* ── Invites ─────────────────────────────────────────────────── */
router.get(
  "/:id/invites",
  param("id").isUUID(),
  validate,
  resolveWedding,
  ctrl.listInvites,
);
router.delete(
  "/:weddingId/invites/:inviteId",
  param("weddingId").isUUID(),
  param("inviteId").isInt(),
  validate,
  resolveWedding,
  ctrl.deleteInvite,
);

/* ── Invite Acceptance (public) ─────────────────────────────── */
router.get(
  "/invites/:token",
  param("token").isUUID(),
  validate,
  ctrl.getInvite,
);
router.post(
  "/invites/:token/accept",
  param("token").isUUID(),
  authenticate,
  validate,
  ctrl.acceptInvite,
);

module.exports = router;
