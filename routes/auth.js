/**
 * @file routes/auth.js
 *
 * Fix: added a guard before the Google OAuth routes that returns a
 * meaningful JSON/redirect error when GOOGLE_CLIENT_ID / SECRET are
 * not configured, instead of Passport throwing "Unknown authentication
 * strategy 'google'" and producing an unhandled 500.
 */

"use strict";

const { Router }   = require("express");
const { body }     = require("express-validator");
const passport     = require("passport");

const ctrl           = require("../controllers/authController");
const { authenticate } = require("../middleware/auth");
const { authLimiter }  = require("../middleware/rateLimiter");
const validate         = require("../middleware/validate");

const router = Router();

/* ── Validation chains ──────────────────────────────────────── */
const registerRules = [
  body("email")
    .isEmail().withMessage("A valid email is required")
    .normalizeEmail(),
  body("password")
    .isLength({ min: 8 }).withMessage("Password must be at least 8 characters")
    .matches(/[A-Z]/).withMessage("Password must contain an uppercase letter")
    .matches(/[0-9]/).withMessage("Password must contain a number"),
  body("displayName")
    .optional().trim().isLength({ max: 80 })
    .withMessage("Display name must be 80 characters or fewer"),
];

const loginRules = [
  body("email").isEmail().normalizeEmail(),
  body("password").notEmpty().withMessage("Password is required"),
];

const updateRules = [
  body("displayName").optional().trim().isLength({ max: 80 }),
  body("weddingDate")
    .optional({ nullable: true }).isISO8601()
    .withMessage("Wedding date must be a valid date (YYYY-MM-DD)"),
];

const passwordRules = [
  body("currentPassword").notEmpty().withMessage("Current password is required"),
  body("newPassword")
    .isLength({ min: 8 }).withMessage("New password must be at least 8 characters"),
];

/* ── Guard: returns a friendly error if OAuth is not configured ── */
function requireOAuthConfig(req, res, next) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    // For browser navigation redirect back to login with an error flag
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
router.post("/login",    authLimiter, loginRules,    validate, ctrl.login);

// Google OAuth — guarded so missing credentials give a clear error
router.get(
  "/google",
  requireOAuthConfig,
  passport.authenticate("google", { scope: ["profile", "email"] }),
);
router.get(
  "/google/callback",
  requireOAuthConfig,
  passport.authenticate("google", { failureRedirect: "/login.html?error=oauth-failed" }),
  ctrl.googleCallback,
);

/* ── Protected routes ───────────────────────────────────────── */
router.get("/me",          authenticate, ctrl.getMe);
router.patch("/me",        authenticate, updateRules,   validate, ctrl.updateMe);
router.post("/me/password",authenticate, passwordRules, validate, ctrl.changePassword);

module.exports = router;
