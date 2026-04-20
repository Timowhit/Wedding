/**
 * @file controllers/authController.js
 * @description Handles user registration, login, profile, and
 * password change.
 */

"use strict";

const User = require("../models/User");
const { signToken } = require("../utils/jwt");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess, sendCreated } = require("../utils/response");

/* ── Register ──────────────────────────────────────────────── */
const register = asyncHandler(async (req, res) => {
  const { email, password, displayName } = req.body;

  const existing = await User.findByEmail(email);
  if (existing)
    {throw ApiError.conflict("An account with that email already exists");}

  const user = await User.create({ email, password, displayName });
  const token = signToken({ id: user.id, email: user.email });

  sendCreated(res, { token, user });
});

/* ── Login ─────────────────────────────────────────────────── */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findByEmail(email);
  if (!user) {throw ApiError.unauthorized("Invalid email or password");}

  const match = await User.comparePassword(password, user.password_hash);
  if (!match) {throw ApiError.unauthorized("Invalid email or password");}

  const token = signToken({ id: user.id, email: user.email });

  // Strip hash from response
  const { password_hash: _, ...safeUser } = user;
  sendSuccess(res, { token, user: safeUser });
});

/* ── Get current user ──────────────────────────────────────── */
const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) {throw ApiError.notFound("User not found");}
  sendSuccess(res, { user });
});

/* ── Update profile ────────────────────────────────────────── */
const updateMe = asyncHandler(async (req, res) => {
  const { displayName, weddingDate } = req.body;
  const user = await User.update(req.user.id, { displayName, weddingDate });
  if (!user) {throw ApiError.notFound("User not found");}
  sendSuccess(res, { user });
});

/* ── Change password ───────────────────────────────────────── */
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findByEmail(req.user.email);
  const match = await User.comparePassword(currentPassword, user.password_hash);
  if (!match) {throw ApiError.badRequest("Current password is incorrect");}

  await User.updatePassword(req.user.id, newPassword);
  sendSuccess(res, { message: "Password updated successfully" });
});

module.exports = { register, login, getMe, updateMe, changePassword };
