import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';

/**
 * Google sign-in through Passport, used only for the OAuth redirect round-trip. Passport does
 * not manage the login session: the auth controller stores the user in req.session itself,
 * exactly as for a password login (`session: false`). `state: true` stores a random value in
 * the session and checks it on the callback, which blocks login CSRF.
 */

const STRATEGY = 'google';

/** @returns {boolean} True when the Google client id and secret are configured. */
const isGoogleConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

/**
 * Registers the strategy if Google is configured. Call once at startup.
 * @param {string} appUrl - Public base URL, e.g. https://planner.example.com
 * @returns {boolean} Whether Google sign-in is enabled.
 */
const configureGoogle = (appUrl) => {
    if (!isGoogleConfigured()) return false;

    passport.use(
        STRATEGY,
        new GoogleStrategy(
            {
                clientID: process.env.GOOGLE_CLIENT_ID,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                callbackURL: new URL('/auth/google/callback', appUrl).href,
                state: true
            },
            (_accessToken, _refreshToken, profile, done) => {
                const primary = profile.emails?.[0];
                done(null, {
                    googleId: profile.id,
                    email: primary?.value?.trim().toLowerCase() ?? null,
                    emailVerified: primary?.verified === true || primary?.verified === 'true',
                    displayName: profile.displayName?.slice(0, 80) || null,
                    avatarUrl: profile.photos?.[0]?.value ?? null
                });
            }
        )
    );
    return true;
};

/**
 * @param {object} options - Passport authenticate options.
 * @returns {import('express').RequestHandler}
 */
const authenticateWithGoogle = (options) => passport.authenticate(STRATEGY, { session: false, ...options });

export { passport, isGoogleConfigured, configureGoogle, authenticateWithGoogle };
