/**
 * @file routes/weddings.js
 * @description Routes for wedding CRUD, membership, and invites.
 */

"use strict";

const { Router } = require("express");
const {
  listWeddings,
  createWedding,
  getWedding,
  updateWedding,
  listMembers,
  addMember,
  updateMemberRole,
  removeMember,
  listInvites,
  deleteInvite,
  getInvite,
  acceptInvite,
  declineInvite,
  getMyPendingInvites,
  createShareLink,
} = require("../controllers/weddingController");

// Adjust this import to match whatever your auth middleware is actually
// called/exported as in this project (e.g. requireAuth, authenticate, etc.)
const { authenticate } = require("../middleware/auth");

const router = Router();

/* ── Invite acceptance/decline (token-based, still requires auth) ──── */
router.get("/invites/:token", authenticate, getInvite);
router.post("/invites/:token/accept", authenticate, acceptInvite);
router.post("/invites/:token/decline", authenticate, declineInvite);

/* ── Wedding CRUD ────────────────────────────────────────────────── */
router.get("/my-pending-invites", authenticate, getMyPendingInvites);
router.get("/", authenticate, listWeddings);
router.post("/", authenticate, createWedding);
router.get("/:id", authenticate, getWedding);
router.patch("/:id", authenticate, updateWedding);

/* ── Members ─────────────────────────────────────────────────────── */
router.get("/:id/members", authenticate, listMembers);
router.post("/:id/members", authenticate, addMember);
router.patch("/:weddingId/members/:userId", authenticate, updateMemberRole);
router.delete("/:weddingId/members/:userId", authenticate, removeMember);

/* ── Invites (management, per-wedding) ──────────────────────────── */
router.get("/:id/invites", authenticate, listInvites);
router.delete("/:weddingId/invites/:inviteId", authenticate, deleteInvite);
router.post("/:id/share-link", authenticate, createShareLink);

module.exports = router;
