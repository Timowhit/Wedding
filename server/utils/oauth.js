/**
 * @file utils/oauth.js
 * @description Passport.js Google OAuth 2.0 strategy setup.
 *
 * Required env vars:
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   APP_URL   (e.g. https://your-app.onrender.com)
 *
 * To get credentials:
 *   1. Go to https://console.cloud.google.com
 *   2. Create a project → APIs & Services → Credentials
 *   3. Create OAuth 2.0 Client ID (Web application)
 *   4. Add Authorized redirect URI:
 *      https://your-app.onrender.com/api/v1/auth/google/callback
 */

"use strict";

const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/User");
const Wedding = require("../models/Wedding");
const logger = require("./logger");

function setup() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    logger.warn(
      "Google OAuth disabled — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable",
    );
    return;
  }

  const callbackURL = `${process.env.APP_URL || "http://localhost:3000"}/api/v1/auth/google/callback`;

  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value?.toLowerCase() ?? null;
          const displayName = profile.displayName ?? email;
          const avatarUrl = profile.photos?.[0]?.value ?? null;
          const googleId = profile.id;

          // Create or link the user
          const user = await User.upsertGoogleUser({
            email,
            googleId,
            displayName,
            avatarUrl,
          });

          // Ensure new OAuth users have a wedding
          const existing = await Wedding.findPrimaryByUser(user.id);
          if (!existing) {
            await Wedding.create(user.id, { name: "Our Wedding" });
          }

          return done(null, user);
        } catch (err) {
          logger.error("Google OAuth error", { error: err.message });
          return done(err);
        }
      },
    ),
  );

  // Minimal session serialisation — we use JWTs, sessions only exist during
  // the OAuth redirect round-trip.
  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id);
      done(null, user ?? false);
    } catch (err) {
      done(err);
    }
  });

  logger.info("Google OAuth strategy registered");
}

module.exports = { setup };
