/**
 * @file routes/auth.js
 *
 * Fixes applied:
 *  1. FIX: Store req.query.returnTo in req.session before the Google OAuth
 *     redirect so Passport preserves it across the round-trip. Without this,
 *     the returnTo value is lost and googleCallback always falls back to
 *     /login.html.
 *  2. FIX: Applied authLimiter to POST /me/password (change password).
 *     Previously this endpoint had no rate limiting, so a stolen token could
 *     be used to brute-force new password values without restriction.
 */

"use strict";

const { Router } = require("express");
const { body } = require("express-validator");
const passport = require("passport");

const ctrl = require("../controllers/authController");
const { authenticate } = require("../middleware/auth");
const { authLimiter } = require("../middleware/rateLimiter");
const validate = require("../middleware/validate");

const router = Router();

/* ── Validation chains ──────────────────────────────────────── */
const registerRules = [
  body("email")
    .isEmail()
    .withMessage("A valid email is required")
    .normalizeEmail(),
  body("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters")
    .matches(/[A-Z]/)
    .withMessage("Password must contain an uppercase letter")
    .matches(/[0-9]/)
    .withMessage("Password must contain a number"),
  body("displayName")
    .optional()
    .trim()
    .isLength({ max: 80 })
    .withMessage("Display name must be 80 characters or fewer"),
];

const loginRules = [
  body("email").isEmail().normalizeEmail(),
  body("password").notEmpty().withMessage("Password is required"),
];

const updateRules = [
  body("displayName").optional().trim().isLength({ max: 80 }),
  body("weddingDate")
    .optional({ nullable: true })
    .isISO8601()
    .withMessage("Wedding date must be a valid date (YYYY-MM-DD)"),
  body("language")
    .optional()
    .isIn(["en", "es"])
    .withMessage("Language must be one of: en, es"),
];

const passwordRules = [
  body("currentPassword")
    .notEmpty()
    .withMessage("Current password is required"),
  body("newPassword")
    .isLength({ min: 8 })
    .withMessage("New password must be at least 8 characters"),
];

/* ── Guard: friendly error if OAuth not configured ──────────── */
function requireOAuthConfig(req, res, next) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    if (req.headers.accept?.includes("text/html")) {
      return res.redirect("/login.html?error=oauth-not-configured");
    }
    return res.status(503).json({
      success: false,
      message:
        "Google sign-in is not configured on this server. " +
        "Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
      errors: [],
    });
  }
  next();
}

/* ── Public routes ──────────────────────────────────────────── */
router.post("/register", authLimiter, registerRules, validate, ctrl.register);
router.post("/login", authLimiter, loginRules, validate, ctrl.login);

router.get(
  "/google",
  requireOAuthConfig,
  // FIX: persist returnTo into the session before handing off to Passport.
  // Passport destroys query params during the OAuth round-trip, so by the
  // time the callback fires req.query.returnTo is gone. Storing it in the
  // session is the standard way to survive the redirect.
  (req, res, next) => {
    if (req.query.returnTo) {
      req.session.returnTo = req.query.returnTo;
    }
    next();
  },
  passport.authenticate("google", { scope: ["profile", "email"] }),
);

router.get(
  "/google/callback",
  requireOAuthConfig,
  passport.authenticate("google", {
    failureRedirect: "/login.html?error=oauth-failed",
  }),
  ctrl.googleCallback,
);

/* ── Protected routes ───────────────────────────────────────── */
router.get("/me", authenticate, ctrl.getMe);
router.patch("/me", authenticate, updateRules, validate, ctrl.updateMe);

// FIX: added authLimiter — change-password had no rate limiting previously.
router.post(
  "/me/password",
  authenticate,
  authLimiter,
  passwordRules,
  validate,
  ctrl.changePassword,
);

module.exports = router;