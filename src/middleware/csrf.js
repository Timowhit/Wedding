import { randomBytes, timingSafeEqual } from 'node:crypto';

// Synchronizer-token CSRF protection. A random token is stored in the server-side session and
// embedded in every form as a hidden field. A forged cross-site POST cannot know the token, so
// it is rejected. This needs no extra dependency because the session already exists.

// Must match the hidden input's name in src/views/partials/csrf-field.ejs.
const FIELD_NAME = '_csrf';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Returns the session's token, creating it the first time a form needs one. */
const getToken = (req) => {
    if (!req.session.csrfToken) req.session.csrfToken = randomBytes(32).toString('hex');
    return req.session.csrfToken;
};

/** Compares two strings in constant time (timingSafeEqual throws on different lengths). */
const tokensMatch = (expected, submitted) => {
    const a = Buffer.from(expected);
    const b = Buffer.from(submitted);
    return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * Adds `csrfToken()` to every view and rejects state-changing requests without a valid token.
 * Mount after the session, express.urlencoded and the language middleware, before the routes.
 *
 * `csrfToken` is a function, not a value, on purpose: the token is only created (and so a
 * session only saved) when a page actually renders a form, not for every anonymous visitor.
 * @type {import('express').RequestHandler}
 */
const csrfProtection = (req, res, next) => {
    res.locals.csrfToken = () => getToken(req);

    if (SAFE_METHODS.has(req.method)) return next();

    const expected = req.session.csrfToken;
    const submitted = req.body?.[FIELD_NAME];

    if (typeof expected === 'string' && typeof submitted === 'string' && tokensMatch(expected, submitted)) {
        return next();
    }

    res.status(403).render('errors/403', {
        title: req.t('errors.formExpiredTitle'),
        message: req.t('errors.formExpired')
    });
};

export { csrfProtection, FIELD_NAME as CSRF_FIELD_NAME };
