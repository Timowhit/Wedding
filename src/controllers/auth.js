import { PG_ERRORS, withTransaction } from '../models/db.js';
import {
    createUser,
    findUserForLogin,
    updateLanguage,
    updatePasswordHash,
    upgradeToPlanner,
    upsertGoogleUser
} from '../models/users.js';
import { countFoundingSpotsLeft } from '../models/founding.js';
import { createWedding } from '../models/weddings.js';
import { authenticateWithGoogle, isGoogleConfigured, passport } from '../services/google.js';
import { isSupportedLanguage } from '../i18n/index.js';
import { setFlash } from '../utils/flash.js';
import { getDummyHash, hashPassword, needsRehash, verifyPassword } from '../utils/password.js';
import { isLocalPath, regenerateSession, startUserSession } from '../utils/session.js';
import { readSignupKind, validateLogin, validateRegistration } from '../validators/auth.js';
import { readText } from '../validators/common.js';

const renderLogin = (req, res, status, values, errors) =>
    res.status(status).render('login', {
        title: req.t('auth.loginTitle'),
        values,
        errors,
        googleEnabled: isGoogleConfigured()
    });

const renderRegister = async (req, res, status, signupAs, values, errors) =>
    res.status(status).render('register', {
        title: req.t(signupAs === 'planner' ? 'auth.plannerTitle' : 'auth.registerTitle'),
        signupAs,
        spotsLeft: signupAs === 'planner' ? await countFoundingSpotsLeft() : 0,
        values,
        errors,
        googleEnabled: isGoogleConfigured()
    });

/** "Start now": choose between a planner account and a couple account. */
const showStart = async (req, res) =>
    res.render('start', { title: req.t('start.title'), spotsLeft: await countFoundingSpotsLeft() });

/**
 * True when the visitor arrived from an invite link (requireLogin or the invite page stored it).
 * They are about to join someone else's wedding, so no wedding of their own is created; if they
 * decline, /welcome lets them create one.
 * @param {import('express').Request} req
 * @returns {boolean}
 */
const isJoiningByInvite = (req) =>
    typeof req.session.returnTo === 'string' && req.session.returnTo.startsWith('/invite/');

const showLoginForm = (req, res) => renderLogin(req, res, 200, { email: '' }, []);

const processLogin = async (req, res) => {
    const { values, password, errors } = validateLogin(req.body);
    if (errors.length > 0) return renderLogin(req, res, 400, values, errors);

    const user = await findUserForLogin(values.email);
    // Always run the hasher, even for unknown emails, so timing does not reveal which emails exist.
    const matches = await verifyPassword(password, user?.password_hash ?? (await getDummyHash()));
    if (!user || !matches) {
        return renderLogin(req, res, 401, values, [{ field: 'password', key: 'auth.invalidCredentials' }]);
    }

    // Hashes from the previous version (bcrypt) are upgraded to scrypt now that we know the password.
    if (needsRehash(user.password_hash)) await updatePasswordHash(user.id, await hashPassword(password));

    const next = await startUserSession(req, user);
    setFlash(req, 'success', 'auth.welcomeBack', { name: req.session.user.name });
    res.redirect(next);
};

const showRegisterForm = (req, res) =>
    renderRegister(req, res, 200, readSignupKind(req.query.as), { name: '', email: '', business_name: '' }, []);

const processRegister = async (req, res) => {
    const signupAs = readSignupKind(req.body?.as);
    const { values, password, errors } = validateRegistration(req.body);
    if (errors.length > 0) return renderRegister(req, res, 400, signupAs, values, errors);

    const passwordHash = await hashPassword(password);
    // Planners start with an empty dashboard and add client weddings; couples get their own wedding.
    const createOwnWedding = signupAs === 'couple' && !isJoiningByInvite(req);
    let user;
    try {
        // The account and its first wedding are created together, or not at all.
        user = await withTransaction(async (client) => {
            const created = await createUser(
                {
                    email: values.email,
                    passwordHash,
                    displayName: values.name,
                    language: req.lang,
                    accountType: signupAs,
                    businessName: signupAs === 'planner' ? values.business_name || null : null
                },
                client
            );
            if (createOwnWedding) {
                await createWedding(created.id, { name: req.t('wedding.defaultName', { name: values.name }) }, client);
            }
            return created;
        });
    } catch (err) {
        // users.email is UNIQUE, so the database is the final judge even for simultaneous sign-ups.
        if (err.code !== PG_ERRORS.UNIQUE_VIOLATION) throw err;
        return renderRegister(req, res, 409, signupAs, values, [{ field: 'email', key: 'auth.emailTaken' }]);
    }

    const next = await startUserSession(req, user);
    const welcomeKey =
        signupAs === 'planner'
            ? 'auth.plannerCreated'
            : createOwnWedding
              ? 'auth.accountCreated'
              : 'auth.accountCreatedForInvite';
    setFlash(req, 'success', welcomeKey, { name: req.session.user.name });
    res.redirect(next);
};

const processLogout = async (req, res) => {
    const { lang } = req;
    await regenerateSession(req); // drops the user and issues a new session id
    req.session.language = lang; // keep the page language the visitor was using
    setFlash(req, 'info', 'auth.loggedOut');
    // Removes the offline copies of wedding pages and the service worker from this device.
    res.set('Clear-Site-Data', '"cache", "storage"');
    res.redirect('/login');
};

/** Redirects to Google. Passport stores a random `state` in the session first. */
const startGoogleLogin = (req, res, next) => {
    if (!isGoogleConfigured()) {
        setFlash(req, 'error', 'auth.googleNotConfigured');
        return res.redirect('/login');
    }
    // "Start now as a planner" with Google: remembered for the callback (see finishGoogleLogin).
    if (req.query.as === 'planner') req.session.signupAs = 'planner';
    else delete req.session.signupAs;
    authenticateWithGoogle({ scope: ['profile', 'email'] })(req, res, next);
};

/** Google redirects back here; Passport verifies `state` and exchanges the code for a profile. */
const finishGoogleLogin = (req, res, next) => {
    if (!isGoogleConfigured()) return next(); // 404

    passport.authenticate('google', { session: false }, async (authError, profile) => {
        try {
            if (authError) console.error('Google sign-in failed:', authError.message);
            if (authError || !profile) {
                setFlash(req, 'error', 'auth.googleFailed');
                return res.redirect('/login');
            }
            // Linking to an existing account by email is only safe when Google verified the email.
            if (!profile.email || !profile.emailVerified) {
                setFlash(req, 'error', 'auth.googleEmailUnverified');
                return res.redirect('/login');
            }

            // The planner intent applies to this one sign-in only.
            const asPlanner = req.session.signupAs === 'planner';
            delete req.session.signupAs;
            const createOwnWedding = !asPlanner && !isJoiningByInvite(req);
            const user = await withTransaction(async (client) => {
                const result = await upsertGoogleUser(
                    { ...profile, language: req.lang, accountType: asPlanner ? 'planner' : 'couple' },
                    client
                );
                if (result.created && createOwnWedding) {
                    const name = result.user.display_name || result.user.email;
                    await createWedding(result.user.id, { name: req.t('wedding.defaultName', { name }) }, client);
                }
                // An existing couple account that chose "Start now as a planner" is upgraded, as in Settings.
                if (!result.created && asPlanner && result.user.account_type !== 'planner') {
                    return upgradeToPlanner(result.user.id, client);
                }
                return result.user;
            });

            const destination = await startUserSession(req, user);
            setFlash(req, 'success', 'auth.welcomeBack', { name: req.session.user.name });
            res.redirect(destination);
        } catch (err) {
            next(err);
        }
    })(req, res, next);
};

/**
 * Language switcher (every page). Saved on the account when logged in, otherwise in the session.
 * Returns to the page the form was on.
 */
const processLanguage = async (req, res) => {
    const language = readText(req.body?.language);
    const returnTo = readText(req.body?.return_to);
    if (isSupportedLanguage(language)) {
        req.session.language = language;
        if (req.session.user) {
            await updateLanguage(req.session.user.id, language);
            req.session.user.language = language;
        }
    }
    res.redirect(isLocalPath(returnTo) ? returnTo : '/');
};

export {
    showStart,
    showLoginForm,
    processLogin,
    showRegisterForm,
    processRegister,
    processLogout,
    startGoogleLogin,
    finishGoogleLogin,
    processLanguage
};
