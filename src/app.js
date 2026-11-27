import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import router from './routes/index.js';
import { pool } from './models/db.js';
import { refreshSessionUser, setCurrentUser } from './middleware/auth.js';
import { csrfProtection } from './middleware/csrf.js';
import { setLanguage } from './middleware/i18n.js';
import { configureGoogle } from './services/google.js';
import { UNSPLASH_IMAGE_HOSTS, isUnsplashConfigured } from './services/unsplash.js';
import { isSpotifyConfigured } from './services/spotify.js';
import { resolveTheme } from './themes.js';
import { takeCelebration } from './utils/celebrate.js';
import { findTaskBadge } from './models/checklist.js';
import { takeFlash } from './utils/flash.js';
import { emphasize, fieldState } from './utils/view-helpers.js';
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES, translate } from './i18n/index.js';

const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000; // a login lasts 8 hours of inactivity
const BODY_LIMIT = '20kb'; // the largest form (vendor notes) is far below this
const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Checks required configuration and stops startup with a clear message when it is missing.
 * @param {NodeJS.ProcessEnv} env
 * @returns {{isProduction: boolean, appUrl: string}}
 */
const readConfig = (env) => {
    const isProduction = (env.NODE_ENV?.toLowerCase() || 'production') === 'production';
    if (!env.DB_URL) throw new Error('DB_URL is not set. Add it to your environment (.env in development).');
    if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
        throw new Error('SESSION_SECRET must be set to a random string of at least 32 characters.');
    }
    if (isProduction && !env.APP_URL) {
        throw new Error('APP_URL must be set in production (it is used for invite links and Google sign-in).');
    }
    return { isProduction, appUrl: env.APP_URL || `http://localhost:${env.PORT || 3000}` };
};

/**
 * Builds the Express app (without listening), so tests can start it on any port.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {import('express').Express}
 */
const createApp = (env = process.env) => {
    const { isProduction, appUrl } = readConfig(env);
    const app = express();

    // Render (and most hosts) terminate HTTPS at a proxy. Without this, Express thinks the request
    // is insecure, express-session refuses to set the `secure` cookie, and rate limits see one IP.
    if (isProduction) app.set('trust proxy', 1);
    app.disable('x-powered-by');

    // Security headers first, so every response gets them (static files included). The CSP only
    // allows this site's own scripts and styles: views must not use inline <script>, inline event
    // handlers or style="" attributes. Third-party hosts are limited to what the features need.
    app.use(
        helmet({
            contentSecurityPolicy: {
                directives: {
                    'img-src': [
                        "'self'",
                        'data:',
                        'https://i.scdn.co',
                        ...UNSPLASH_IMAGE_HOSTS.map((h) => `https://${h}`)
                    ],
                    'style-src': ["'self'", 'https://fonts.googleapis.com'],
                    'font-src': ["'self'", 'https://fonts.gstatic.com'],
                    'frame-src': ['https://open.spotify.com'],
                    'form-action': ["'self'", 'https://accounts.google.com'],
                    'upgrade-insecure-requests': isProduction ? [] : null
                }
            }
        })
    );

    app.set('view engine', 'ejs');
    app.set('views', path.join(rootDir, 'src/views'));

    app.use(express.static(path.join(rootDir, 'public'), { maxAge: isProduction ? '1d' : 0 }));
    app.get('/favicon.ico', (req, res) => res.status(204).end()); // keeps favicon requests from consuming the flash
    app.use(express.urlencoded({ extended: false, limit: BODY_LIMIT })); // HTML form bodies only

    // Only the session id lives in the cookie; the data stays in the `session` table
    // (migration 007). The default in-memory store leaks memory and loses logins on restart.
    const PgSessionStore = connectPgSimple(session);
    app.use(
        session({
            name: 'fp.sid',
            store: new PgSessionStore({ pool, tableName: 'session' }),
            secret: env.SESSION_SECRET,
            resave: false, // don't re-save sessions that didn't change
            saveUninitialized: false, // no session (or cookie) until something is stored
            rolling: true, // each request extends the login, so it expires after inactivity
            cookie: { httpOnly: true, sameSite: 'lax', secure: isProduction, maxAge: SESSION_MAX_AGE_MS }
        })
    );

    configureGoogle(appUrl);

    // Order matters: refresh the user (may set a flash) -> pick the language -> expose locals -> CSRF.
    app.use(refreshSessionUser);
    app.use(setLanguage);
    app.use((req, res, next) => {
        res.locals.currentPath = req.path;
        res.locals.currentUrl = req.originalUrl;
        // The offline worker's background saves (X-FP-Background) must not use up a notice.
        res.locals.flash = req.get('x-fp-background') ? null : takeFlash(req);
        res.locals.languages = SUPPORTED_LANGUAGES;
        res.locals.errors = [];
        res.locals.emphasize = emphasize;
        res.locals.fieldState = fieldState;
        // Optional features without API keys are left out of the navigation and dashboard.
        res.locals.features = { music: isSpotifyConfigured(), inspiration: isUnsplashConfigured() };
        // A function, because the wedding is only loaded later by the route's own middleware.
        res.locals.currentTheme = () => resolveTheme({ user: res.locals.user, wedding: res.locals.wedding });
        // Offline copies of pages show when they were saved (see public/sw.js).
        res.locals.renderedAt = new Date().toISOString();
        // Every rendered page names its wedding ("none" when signed out or without one). The
        // service worker drops its saved pages when this changes, so an offline copy never
        // outlives a wedding switch, a sign-in as someone else or an expired session.
        // Pages also get the header's checklist badge and any celebration, loaded only here, so
        // redirects, JSON and stylesheets never pay for them.
        const render = res.render.bind(res);
        res.render = (view, options, callback) => {
            if (!res.headersSent) res.set('X-FP-Wedding', res.locals.wedding?.id ?? 'none');
            const weddingId = res.locals.wedding?.id;
            // Error pages skip both, so a failing database can't turn one error into a loop.
            if (!weddingId || view.startsWith('errors/')) return render(view, options, callback);
            res.locals.celebration = takeCelebration(req, weddingId);
            findTaskBadge(weddingId)
                .then((badge) => {
                    res.locals.taskBadge = badge;
                    render(view, options, callback);
                })
                .catch((error) => req.next(error));
        };
        next();
    });
    app.use(setCurrentUser);
    app.use(csrfProtection);

    app.use(router);

    // 404: runs only if no route matched (or a controller called next() for an unknown id).
    app.use((req, res) => {
        res.status(404).render('errors/404', { title: req.t('errors.notFoundTitle') });
    });

    // Error handler: must be last, with four parameters. Details go to the log, never to the page.
    app.use((err, req, res, next) => {
        console.error(err);
        if (res.headersSent) return next(err);
        const status = err.type === 'entity.too.large' ? 413 : 500;
        // The failure may have happened before the language middleware ran (e.g. the session store).
        if (!res.locals.t) {
            res.locals.t = (key, vars) => translate(DEFAULT_LANGUAGE, key, vars);
            res.locals.lang = DEFAULT_LANGUAGE;
            res.locals.languages = SUPPORTED_LANGUAGES;
            res.locals.currentUrl = '/';
            res.locals.currentPath = req.path;
            res.locals.csrfToken = () => '';
            res.locals.emphasize = emphasize;
            res.locals.features = { music: false, inspiration: false };
            res.locals.currentTheme = () => resolveTheme({});
        }
        res.status(status).render('errors/500', { title: res.locals.t('errors.serverErrorTitle'), status });
    });

    return app;
};

export { createApp, readConfig };
