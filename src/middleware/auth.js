import { touchTrial } from '../models/trials.js';
import { findUserById } from '../models/users.js';
import { setFlash } from '../utils/flash.js';

/**
 * Builds the copy of a user kept in the session. Only what pages need; never the password hash.
 * @param {Object} row - A users row with the public columns (see models/users.js).
 * @returns {{id: string, email: string, name: string, avatarUrl: string|null, language: string, accountType: string, isPlanner: boolean, foundingNumber: number|null, businessName: string|null, themePalette: string, themeMode: string, themeColors: string|null, brandPalette: string|null}}
 */
const toSessionUser = (row) => ({
    id: row.id,
    email: row.email,
    name: row.display_name || row.email,
    avatarUrl: row.avatar_url,
    language: row.language,
    accountType: row.account_type,
    isPlanner: row.account_type === 'planner',
    foundingNumber: row.founding_number ?? null,
    businessName: row.business_name ?? null,
    themePalette: row.theme_palette,
    themeMode: row.theme_mode,
    themeColors: row.theme_colors ?? null,
    reminderEmails: row.reminder_emails !== false,
    brandPalette: row.brand_palette ?? null,
    isTrial: row.is_trial === true
});

/**
 * Re-checks a logged-in session against the database on every request, so a profile change or
 * a deleted account takes effect immediately. The session keeps only a copy of the user; the
 * database row is the source of truth. Costs one primary-key lookup per logged-in request.
 * @type {import('express').RequestHandler}
 */
const refreshSessionUser = async (req, res, next) => {
    const sessionUser = req.session.user;
    if (!sessionUser) return next();

    const current = await findUserById(sessionUser.id);
    if (!current) {
        delete req.session.user;
        delete req.session.activeWeddingId;
        setFlash(req, 'info', 'auth.accountMissing');
        return next();
    }

    req.session.user = toSessionUser(current);
    if (current.is_trial) await touchTrial(current.id); // keeps a trial in use from being deleted
    next();
};

/**
 * Exposes the logged-in user to every view as `user` (or null). Views only read it; access
 * checks always happen in requireLogin and the wedding middleware.
 * @type {import('express').RequestHandler}
 */
const setCurrentUser = (req, res, next) => {
    res.locals.user = req.session.user ?? null;
    next();
};

/**
 * Lets any logged-in user through. Everyone else goes to /login, and GET requests are
 * remembered so the user lands back on that page after logging in.
 * @type {import('express').RequestHandler}
 */
const requireLogin = (req, res, next) => {
    if (req.session.user) return next();

    // Only GET requests can be replayed safely after login; a POST would lose its form data.
    if (req.method === 'GET') req.session.returnTo = req.originalUrl;
    setFlash(req, 'info', 'auth.loginRequired');
    res.redirect('/login');
};

/**
 * Sends already logged-in users away from the login and register pages.
 * @type {import('express').RequestHandler}
 */
const redirectIfLoggedIn = (req, res, next) => {
    if (req.session.user) return res.redirect('/');
    next();
};

/**
 * Sends signed-up users away from the sign-up, login and trial pages. A trial may use them: to
 * sign up (keeping the trial wedding) or to log in to an account it already has.
 * @type {import('express').RequestHandler}
 */
const redirectIfSignedUp = (req, res, next) => {
    if (req.session.user && !req.session.user.isTrial) return res.redirect('/');
    next();
};

/**
 * Things a trial can't do until it signs up (inviting people, uploading files, a password):
 * it is sent to the sign-up form with a note.
 * @type {import('express').RequestHandler}
 */
const requireRealAccount = (req, res, next) => {
    if (!req.session.user?.isTrial) return next();
    setFlash(req, 'info', 'trial.signUpFirst');
    res.redirect('/register');
};

/**
 * Planner accounts only. Anyone else gets the 404 page, as if the page did not exist.
 * Must run after requireLogin.
 * @type {import('express').RequestHandler}
 */
const requirePlanner = (req, res, next) => {
    if (req.session.user?.isPlanner) return next();
    next('router');
};

export {
    requirePlanner,
    toSessionUser,
    refreshSessionUser,
    setCurrentUser,
    requireLogin,
    redirectIfLoggedIn,
    redirectIfSignedUp,
    requireRealAccount
};
