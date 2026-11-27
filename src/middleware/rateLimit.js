import { rateLimit } from 'express-rate-limit';

// Counters live in this process's memory, which is fine for a single server instance: they
// reset on restart and are not shared between instances. Behind a proxy (production), the
// client address comes from `trust proxy`, which server.js sets.

const MINUTE = 60 * 1000;

/** Renders the 429 page with a translated message. */
const tooManyRequests = (messageKey) => (req, res) => {
    res.status(429).render('errors/429', { title: req.t('errors.tooManyTitle'), message: req.t(messageKey) });
};

/**
 * @param {{ windowMs: number, limit: number, messageKey: string, skipSuccessfulRequests?: boolean }} options
 * @returns {import('express').RequestHandler}
 */
const createLimiter = ({ messageKey, ...options }) =>
    rateLimit({
        standardHeaders: true, // sends the standard RateLimit-* headers
        legacyHeaders: false, // skips the old X-RateLimit-* headers
        handler: tooManyRequests(messageKey),
        ...options
    });

/** Password guessing: 10 failed logins per address per 15 minutes (a redirect = success). */
const loginLimiter = createLimiter({
    windowMs: 15 * MINUTE,
    limit: 10,
    skipSuccessfulRequests: true,
    messageKey: 'errors.tooManyLogins'
});

/** Account creation runs the deliberately slow hasher: 10 attempts per address per hour. */
const registerLimiter = createLimiter({ windowMs: 60 * MINUTE, limit: 10, messageKey: 'errors.tooManyRegistrations' });
/** Trials per address per hour: each one is a small wedding in the database. */
const trialLimiter = createLimiter({ windowMs: 60 * MINUTE, limit: 10, messageKey: 'errors.tooManyTrials' });

/** Changing a password checks the current one, so it is limited like a login. */
const passwordLimiter = createLimiter({
    windowMs: 15 * MINUTE,
    limit: 10,
    skipSuccessfulRequests: true,
    messageKey: 'errors.tooManyPasswordChanges'
});

/** Invites can send email: 20 per address per hour. */
const inviteLimiter = createLimiter({ windowMs: 60 * MINUTE, limit: 20, messageKey: 'errors.tooManyInvites' });

/** Music and photo searches call third-party APIs with quotas: 60 per address per 15 minutes. */
const searchLimiter = createLimiter({
    windowMs: 15 * MINUTE,
    limit: 60,
    skip: (req) => !req.query.q, // plain page views are not searches
    messageKey: 'errors.tooManySearches'
});

/** Uploads: 60 per person per hour (each can be 10 MB). Keyed by account, so a shared office address doesn't share the limit. */
const uploadLimiter = createLimiter({
    windowMs: 60 * MINUTE,
    limit: 60,
    keyGenerator: (req) => `user:${req.session.user.id}`,
    messageKey: 'files.tooMany'
});

export { uploadLimiter, loginLimiter, registerLimiter, trialLimiter, passwordLimiter, inviteLimiter, searchLimiter };
