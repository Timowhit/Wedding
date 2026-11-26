import { findWeddingForMember, findWeddingsForUser } from '../models/weddings.js';
import { setFlash } from '../utils/flash.js';

// Clients (couples in a planner wedding) can change plans like editors; only the owner manages
// members and settings.
const ROLE_RANK = { viewer: 1, client: 2, editor: 2, owner: 3 };

/**
 * Who asks and who answers decisions. In a planner wedding the planner side asks and the couple
 * (clients) answer; in a couple's own wedding both partners (owner and editors) may do either.
 * @param {{role: string, planner_managed: boolean}} wedding - With the current member's role.
 * @returns {{canAsk: boolean, canAnswer: boolean}}
 */
const decisionPermissions = (wedding) => {
    const rank = ROLE_RANK[wedding.role] ?? 0;
    if (wedding.planner_managed) {
        return { canAsk: rank >= ROLE_RANK.editor && wedding.role !== 'client', canAnswer: wedding.role === 'client' };
    }
    return { canAsk: rank >= ROLE_RANK.editor, canAnswer: rank >= ROLE_RANK.editor };
};

/**
 * Finds the user's active wedding: the one remembered in the session if they are still a member,
 * otherwise their first. Re-checked against wedding_members on every request, so removing
 * someone takes effect immediately.
 * @param {import('express').Request} req
 * @returns {Promise<{wedding: Object|null, weddings: Object[]}>}
 */
const findActiveWedding = async (req) => {
    const weddings = await findWeddingsForUser(req.session.user.id);
    const activeId = req.session.activeWeddingId;
    const wedding = (activeId && weddings.find((w) => w.id === activeId)) || weddings[0] || null;
    if (wedding) req.session.activeWeddingId = wedding.id;
    else delete req.session.activeWeddingId;
    return { wedding, weddings };
};

/** Exposes the wedding (or its absence) and what the member may do in it to `req` and the views. */
const exposeWedding = (req, res, wedding, weddings) => {
    const decisions = wedding ? decisionPermissions(wedding) : { canAsk: false, canAnswer: false };
    req.wedding = wedding;
    res.locals.wedding = wedding;
    res.locals.weddings = weddings;
    res.locals.canEdit = Boolean(wedding) && ROLE_RANK[wedding.role] >= ROLE_RANK.editor;
    res.locals.isOwner = wedding?.role === 'owner';
    res.locals.isPlannerWedding = wedding?.planner_managed === true;
    res.locals.canAskDecisions = decisions.canAsk;
    res.locals.canAnswerDecisions = decisions.canAnswer;
};

/**
 * Loads the wedding the user is working on into `req.wedding` and the views (`wedding`,
 * `weddings`, `canEdit`, `isOwner`, `isPlannerWedding`, `canAskDecisions`, `canAnswerDecisions`).
 * Must run after requireLogin. A user with no wedding is sent to the planner dashboard (planners)
 * or to /welcome to create or join one (everyone else).
 * @type {import('express').RequestHandler}
 */
const loadActiveWedding = async (req, res, next) => {
    const { wedding, weddings } = await findActiveWedding(req);
    if (!wedding) return res.redirect(req.session.user.isPlanner ? '/planner' : '/welcome');
    exposeWedding(req, res, wedding, weddings);
    next();
};

/**
 * Like loadActiveWedding, but a user with no wedding carries on with `wedding` set to null
 * (account pages such as Settings work before a planner has any client weddings).
 * @type {import('express').RequestHandler}
 */
const loadOptionalWedding = async (req, res, next) => {
    const { wedding, weddings } = await findActiveWedding(req);
    exposeWedding(req, res, wedding, weddings);
    next();
};

/**
 * Builds middleware that only lets members with at least `minimumRole` through. Others get a
 * flash message and are sent back to the section's main page (a GET they can always open).
 * @param {'editor'|'owner'} minimumRole
 * @returns {import('express').RequestHandler}
 */
const requireWeddingRole = (minimumRole) => {
    if (!(minimumRole in ROLE_RANK) || minimumRole === 'viewer') {
        throw new Error('requireWeddingRole needs "editor" or "owner"');
    }
    const messageKey = minimumRole === 'owner' ? 'wedding.ownerOnly' : 'wedding.viewOnly';

    return (req, res, next) => {
        if (ROLE_RANK[req.wedding?.role] >= ROLE_RANK[minimumRole]) return next();
        setFlash(req, 'error', messageKey);
        const section = req.baseUrl || `/${req.path.split('/')[1] ?? ''}`;
        res.redirect(section || '/');
    };
};

/**
 * Switches the active wedding after confirming membership.
 * @param {import('express').Request} req
 * @param {string} weddingId - Already validated as a UUID.
 * @returns {Promise<Object|null>} The wedding, or null when the user is not a member.
 */
const switchActiveWedding = async (req, weddingId) => {
    const wedding = await findWeddingForMember(weddingId, req.session.user.id);
    if (wedding) req.session.activeWeddingId = wedding.id;
    return wedding;
};

const requireEditor = requireWeddingRole('editor');
const requireOwner = requireWeddingRole('owner');

export {
    ROLE_RANK,
    decisionPermissions,
    loadActiveWedding,
    loadOptionalWedding,
    requireWeddingRole,
    requireEditor,
    requireOwner,
    switchActiveWedding
};
