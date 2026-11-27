import { toSessionUser } from '../middleware/auth.js';

/** Wraps the callback-style session.regenerate so it can be awaited. */
const regenerateSession = (req) =>
    new Promise((resolve, reject) => {
        req.session.regenerate((err) => (err ? reject(err) : resolve()));
    });

/**
 * True for a same-site path. Blocks open redirects such as "//evil.example" or "/\\evil.example".
 * @param {unknown} value
 * @returns {boolean}
 */
const isLocalPath = (value) => typeof value === 'string' && value.length <= 500 && /^\/(?![/\\])/.test(value);

/**
 * A local path that is worth returning to after login (not the auth pages themselves).
 * @param {unknown} value
 * @returns {boolean}
 */
const isSafeReturnPath = (value) => isLocalPath(value) && !/^\/(login|register|logout)\b/.test(value);

/**
 * Logs a user in: issues a fresh session id (prevents session fixation), keeps the page they
 * were heading to, and stores only the public copy of the user.
 * @param {import('express').Request} req
 * @param {Object} userRow - A users row (public columns).
 * @returns {Promise<string>} Where to redirect next: the remembered page, else the planner dashboard
 *          for planners and the wedding dashboard for everyone else.
 */
const startUserSession = async (req, userRow) => {
    const { returnTo } = req.session;
    await regenerateSession(req);
    req.session.user = toSessionUser(userRow);
    if (isSafeReturnPath(returnTo)) return returnTo;
    return req.session.user.isPlanner ? '/planner' : '/';
};

export { regenerateSession, isLocalPath, isSafeReturnPath, startUserSession };
