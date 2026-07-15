/**
 * @file controllers/authController.js
 */

"use strict";

const User = require("../models/User");
const Wedding = require("../models/Wedding");
const { signToken } = require("../utils/jwt");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess, sendCreated } = require("../utils/response");

/* ── Register ──────────────────────────────────────────────── */
const register = asyncHandler(async (req, res) => {
  const { email, password, displayName } = req.body;

  const existing = await User.findByEmail(email);
  if (existing) {
    throw ApiError.conflict("An account with that email already exists");
  }

  const user = await User.create({ email, password, displayName });

  const weddingName = displayName ? `${displayName}'s Wedding` : "Our Wedding";
  await Wedding.create(user.id, { name: weddingName });

  const token = signToken({ id: user.id, email: user.email });
  sendCreated(res, { token, user });
});

/* ── Login ─────────────────────────────────────────────────── */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findByEmail(email);
  if (!user) {
    throw ApiError.unauthorized("Invalid email or password");
  }

  const match = await User.comparePassword(password, user.password_hash);
  if (!match) {
    throw ApiError.unauthorized("Invalid email or password");
  }

  const token = signToken({ id: user.id, email: user.email });
  const { password_hash: _, ...safeUser } = user;
  sendSuccess(res, { token, user: safeUser });
});

/* ── Get current user ──────────────────────────────────────── */
const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) {
    throw ApiError.notFound("User not found");
  }
  sendSuccess(res, { user });
});

/* ── Update profile ────────────────────────────────────────── */
const updateMe = asyncHandler(async (req, res) => {
  const { displayName, weddingDate, language } = req.body;
  const user = await User.update(req.user.id, {
    displayName,
    weddingDate,
    language,
  });
  if (!user) {
    throw ApiError.notFound("User not found");
  }
  sendSuccess(res, { user });
});

/* ── Change password ───────────────────────────────────────── */
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findByEmail(req.user.email);
  const match = await User.comparePassword(currentPassword, user.password_hash);
  if (!match) {
    throw ApiError.badRequest("Current password is incorrect");
  }

  await User.updatePassword(req.user.id, newPassword);
  sendSuccess(res, { message: "Password updated successfully" });
});

/* ── Google OAuth callback ─────────────────────────────────── */

/**
 * FIX: The previous implementation always redirected to /login.html?token=…
 * regardless of any returnTo param. This broke the invite flow in invite.js,
 * which navigates to /api/v1/auth/google?returnTo=/invite.html?token=<uuid>
 * so the user lands back on the invite page after OAuth instead of the
 * dashboard.
 *
 * Security: returnTo is validated to be a relative path (starts with "/",
 * does not start with "//", contains no protocol) before use, preventing
 * an open redirect to an external domain.
 */
const googleCallback = asyncHandler(async (req, res) => {
  const token = signToken({ id: req.user.id, email: req.user.email });

  // Read returnTo from the session (Passport preserves req.session during
  // the OAuth round-trip) or fall back to the query param on the callback URL.
  const rawReturnTo =
    req.session?.returnTo || req.query?.returnTo || "/login.html";

  // Guard: only allow relative paths to prevent open redirect.
  // A safe relative path starts with "/" but not "//" (protocol-relative).
  const isSafeRelative =
    typeof rawReturnTo === "string" &&
    rawReturnTo.startsWith("/") &&
    !rawReturnTo.startsWith("//") &&
    !/^\/[a-z]+:/i.test(rawReturnTo); // blocks /javascript: etc.

  const returnTo = isSafeRelative ? rawReturnTo : "/login.html";

  // Clear the session value now that we've consumed it
  if (req.session?.returnTo) {
    delete req.session.returnTo;
  }

  // Append the JWT token as a query param so the client-side JS can pick it up
  const separator = returnTo.includes("?") ? "&" : "?";
  res.redirect(`${returnTo}${separator}token=${encodeURIComponent(token)}`);
});

module.exports = {
  register,
  login,
  getMe,
  updateMe,
  changePassword,
  googleCallback,
};
