/**
 * @file controllers/weddingController.js
 * @description Handles wedding CRUD, member management, and invites.
 */

"use strict";

const Wedding = require("../models/Wedding");
const Invite = require("../models/Invite");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess, sendCreated } = require("../utils/response");

/* ── Weddings ────────────────────────────────────────────── */

/** List all weddings the user belongs to. */
const listWeddings = asyncHandler(async (req, res) => {
  const weddings = await Wedding.findAllByUser(req.user.id);
  sendSuccess(res, { weddings });
});

/** Create a new wedding. */
const createWedding = asyncHandler(async (req, res) => {
  const { name, weddingDate } = req.body;
  const wedding = await Wedding.create(req.user.id, { name, weddingDate });
  sendCreated(res, { wedding });
});

/** Get a specific wedding (user must be member). */
const getWedding = asyncHandler(async (req, res) => {
  const wedding = await Wedding.findById(req.params.id);
  if (!wedding) {
    throw ApiError.notFound("Wedding not found");
  }

  const membership = await Wedding.getMembership(wedding.id, req.user.id);
  if (!membership) {
    throw ApiError.forbidden("You are not a member of this wedding");
  }

  sendSuccess(res, { wedding: { ...wedding, role: membership.role } });
});

/** Update wedding details (owner only). */
const updateWedding = asyncHandler(async (req, res) => {
  const { name, weddingDate } = req.body;
  const weddingId = req.params.id;

  const membership = await Wedding.getMembership(weddingId, req.user.id);
  if (!membership || membership.role !== "owner") {
    throw ApiError.forbidden("Only the owner can update wedding details");
  }

  const wedding = await Wedding.update(weddingId, { name, weddingDate });
  if (!wedding) {
    throw ApiError.notFound("Wedding not found");
  }

  sendSuccess(res, { wedding });
});

/* ── Members ─────────────────────────────────────────────── */

/** List all members of a wedding. */
const listMembers = asyncHandler(async (req, res) => {
  const weddingId = req.params.id;

  const membership = await Wedding.getMembership(weddingId, req.user.id);
  if (!membership) {
    throw ApiError.forbidden("You are not a member of this wedding");
  }

  const members = await Wedding.getMembers(weddingId);
  sendSuccess(res, { members });
});

/** Add a member by email (send invite). */
const addMember = asyncHandler(async (req, res) => {
  const { email, role = "editor" } = req.body;
  const weddingId = req.params.id;

  const membership = await Wedding.getMembership(weddingId, req.user.id);
  if (!membership || membership.role !== "owner") {
    throw ApiError.forbidden("Only the owner can invite members");
  }

  // Check if user exists
  const user = await User.findByEmail(email.toLowerCase().trim());
  if (user) {
    // Add directly if user exists
    await Wedding.addMember(weddingId, user.id, role);
    sendSuccess(res, { message: "Member added successfully" });
  } else {
    // Create invite
    const invite = await Invite.create(weddingId, req.user.id, {
      invitedEmail: email,
      role,
    });
    sendCreated(res, { invite });
  }
});

/** Update a member's role. */
const updateMemberRole = asyncHandler(async (req, res) => {
  const { role } = req.body;
  const { weddingId, userId } = req.params;

  const membership = await Wedding.getMembership(weddingId, req.user.id);
  if (!membership || membership.role !== "owner") {
    throw ApiError.forbidden("Only the owner can change member roles");
  }

  if (userId === req.user.id) {
    throw ApiError.badRequest("You cannot change your own role");
  }

  const updated = await Wedding.updateMemberRole(weddingId, userId, role);
  if (!updated) {
    throw ApiError.notFound("Member not found");
  }

  sendSuccess(res, { member: updated });
});

/** Remove a member. */
const removeMember = asyncHandler(async (req, res) => {
  const { weddingId, userId } = req.params;

  const membership = await Wedding.getMembership(weddingId, req.user.id);
  if (!membership || membership.role !== "owner") {
    throw ApiError.forbidden("Only the owner can remove members");
  }

  if (userId === req.user.id) {
    throw ApiError.badRequest("You cannot remove yourself");
  }

  const removed = await Wedding.removeMember(weddingId, userId);
  if (!removed) {
    throw ApiError.notFound("Member not found");
  }

  sendSuccess(res, { message: "Member removed successfully" });
});

/* ── Invites ─────────────────────────────────────────────── */

/** List invites for a wedding. */
const listInvites = asyncHandler(async (req, res) => {
  const weddingId = req.params.id;

  const membership = await Wedding.getMembership(weddingId, req.user.id);
  if (!membership) {
    throw ApiError.forbidden("You are not a member of this wedding");
  }

  const invites = await Invite.findByWedding(weddingId);
  sendSuccess(res, { invites });
});

/** Delete an invite. */
const deleteInvite = asyncHandler(async (req, res) => {
  const { weddingId, inviteId } = req.params;

  const membership = await Wedding.getMembership(weddingId, req.user.id);
  if (!membership) {
    throw ApiError.forbidden("You are not a member of this wedding");
  }

  const deleted = await Invite.delete(inviteId, weddingId);
  if (!deleted) {
    throw ApiError.notFound("Invite not found");
  }

  sendSuccess(res, { message: "Invite deleted successfully" });
});

/* ── Invite Acceptance ─────────────────────────────────── */

/** Get invite details by token. */
const getInvite = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const invite = await Invite.findByToken(token);
  if (!invite) {
    throw ApiError.notFound("Invite not found");
  }

  if (Invite.isExpired(invite)) {
    throw ApiError.gone("Invite has expired");
  }

  sendSuccess(res, invite);
});

/** Accept an invite. */
const acceptInvite = asyncHandler(async (req, res) => {
  const { token } = req.params;

  // Find invite
  const invite = await Invite.findByToken(token);
  if (!invite) {
    throw ApiError.notFound("Invite not found");
  }

  if (Invite.isExpired(invite)) {
    throw ApiError.gone("Invite has expired");
  }

  // Accept the invite (marks as accepted)
  const accepted = await Invite.accept(token);
  if (!accepted) {
    throw ApiError.conflict("Invite already accepted");
  }

  // Add user to wedding
  await Wedding.addMember(invite.wedding_id, req.user.id, invite.role);

  sendSuccess(res, { message: "Invite accepted successfully" });
});

/** GET /weddings/my-pending-invites */
const getMyPendingInvites = asyncHandler(async (req, res) => {
  const invites = await Invite.findPendingForEmail(req.user.email);
  sendSuccess(res, { invites });
});

module.exports = {
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
  getMyPendingInvites,
};
