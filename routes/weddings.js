/**
 * @file routes/weddings.js
 *
 * Fixes applied:
 *  1. GET /invites/:token is now PUBLIC (moved before router.use(authenticate))
 *  2. Removed broken requireOwner middleware — controllers do their own checks
 *  3. Fixed inviteId param validation: .isInt() → .isUUID()
 *  4. Removed resolveWedding from wedding routes (controllers use req.params.id directly)
 */

"use strict";

const { Router } = require("express");
const { body, param } = require("express-validator");

const ctrl = require("../controllers/weddingController");
const { authenticate } = require("../middleware/auth");
const validate = require("../middleware/validate");

const router = Router();

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

/* ── PUBLIC routes (no auth required) ───────────────────────── */

// Anyone with the link can view invite details before logging in
router.get(
  "/invites/:token",
  param("token").isUUID(),
  validate,
  ctrl.getInvite,
);

// Accept requires auth (to know who is accepting)
router.post(
  "/invites/:token/accept",
  param("token").isUUID(),
  authenticate,
  validate,
  ctrl.acceptInvite,
);

/* ── All routes below require authentication ────────────────── */
router.use(authenticate);
router.get("/my-pending-invites", ctrl.getMyPendingInvites);
router.post(
  "/:id/share-link",
  param("id").isUUID(),
  body("role").optional().isIn(["viewer", "editor"]),
  validate,
  ctrl.createShareLink,
);
/* Wedding CRUD */
router.get("/", ctrl.listWeddings);
router.post("/", weddingRules, validate, ctrl.createWedding);
router.get("/:id", param("id").isUUID(), validate, ctrl.getWedding);
// Controller does its own owner check — no middleware needed here
router.patch(
  "/:id",
  param("id").isUUID(),
  weddingRules,
  validate,
  ctrl.updateWedding,
);

/* Members */
router.get("/:id/members", param("id").isUUID(), validate, ctrl.listMembers);
// Controller checks ownership internally
router.post(
  "/:id/members",
  param("id").isUUID(),
  memberRules,
  validate,
  ctrl.addMember,
);
router.patch(
  "/:weddingId/members/:userId",
  param("weddingId").isUUID(),
  param("userId").isUUID(),
  roleUpdateRules,
  validate,
  ctrl.updateMemberRole,
);
router.delete(
  "/:weddingId/members/:userId",
  param("weddingId").isUUID(),
  param("userId").isUUID(),
  validate,
  ctrl.removeMember,
);

/* Invites management (auth required) */
router.get("/:id/invites", param("id").isUUID(), validate, ctrl.listInvites);
router.delete(
  "/:weddingId/invites/:inviteId",
  param("weddingId").isUUID(),
  param("inviteId").isUUID(), // ← was isInt() — inviteId is a UUID
  validate,
  ctrl.deleteInvite,
);

module.exports = router;
