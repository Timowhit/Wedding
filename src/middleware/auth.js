import { findUserById } from '../models/users.js';
import { setFlash } from '../utils/flash.js';

/**
 * Builds the copy of a user kept in the session. Only what pages need; never the password hash.
 * @param {{id: string, email: string, display_name: string|null, avatar_url: string|null, language: string}} row
 * @returns {{id: string, email: string, name: string, avatarUrl: string|null, language: string}}
 */
const toSessionUser = (row) => ({
    id: row.id,
    email: row.email,
    name: row.display_name || row.email,
    avatarUrl: row.avatar_url,
    language: row.language
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

export { toSessionUser, refreshSessionUser, setCurrentUser, requireLogin, redirectIfLoggedIn };
