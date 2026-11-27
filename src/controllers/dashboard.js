import { countOpenDecisions } from '../models/decisions.js';
import { findMoneySummary } from '../models/payments.js';
import { findTaskProgress } from '../models/checklist.js';
import { findGuestStats } from '../models/guests.js';
import { findPendingInvitesForEmail } from '../models/invites.js';
import { countTracks } from '../models/music.js';
import { countPhotos } from '../models/inspiration.js';
import { findVendorStats } from '../models/vendors.js';
import { countMembers, createWedding, updateWeddingDate } from '../models/weddings.js';
import { switchActiveWedding } from '../middleware/wedding.js';
import { daysUntil } from '../utils/format.js';
import { setFlash } from '../utils/flash.js';
import { isLocalPath } from '../utils/session.js';
import { isUuid, readText } from '../validators/common.js';
import { extractInviteToken, validateWedding, validateWeddingDate } from '../validators/weddings.js';

const EMPTY_WEDDING = { name: '', wedding_date: '' };

/**
 * First steps for a new wedding, shown until they are all done. Only steps the member's role
 * can do are listed (viewers see none; inviting is for the owner).
 * @returns {Array<{key: string, href: string, done: boolean}>}
 */
const gettingStartedSteps = (wedding, stats, memberCount) => {
    if (wedding.role === 'viewer') return [];
    const steps = [
        { key: 'onboarding.setDate', href: '#wedding-date-form', done: Boolean(wedding.wedding_date), ownerOnly: true },
        { key: 'onboarding.setBudget', href: '/budget', done: stats.budgetLimit > 0 },
        { key: 'onboarding.addGuests', href: '/guests', done: stats.guests.total > 0 },
        { key: 'onboarding.addTasks', href: '/checklist', done: stats.tasks.total > 0 },
        { key: 'onboarding.invitePartner', href: '/settings#invite-heading', done: memberCount > 1, ownerOnly: true }
    ];
    return steps
        .filter((step) => !step.ownerOnly || wedding.role === 'owner')
        .map(({ ownerOnly: _owner, ...step }) => step);
};

const showDashboard = async (req, res) => {
    const weddingId = req.wedding.id;
    const [money, guests, tasks, vendors, tracks, photos, pendingInvites, memberCount, openDecisions] =
        await Promise.all([
            findMoneySummary(weddingId),
            findGuestStats(weddingId),
            findTaskProgress(weddingId),
            findVendorStats(weddingId),
            countTracks(weddingId),
            countPhotos(weddingId),
            findPendingInvitesForEmail(req.session.user.email),
            countMembers(weddingId),
            countOpenDecisions(weddingId)
        ]);
    const stats = { budgetLimit: money.limit, committed: money.committed, guests, tasks, vendors, tracks, photos };
    const steps = gettingStartedSteps(req.wedding, stats, memberCount);

    res.render('dashboard', {
        title: req.t('dashboard.title'),
        stats,
        steps: steps.every((step) => step.done) ? [] : steps,
        openDecisions,
        daysLeft: daysUntil(req.wedding.wedding_date),
        pendingInvites,
        errors: []
    });
};

const processWeddingDate = async (req, res) => {
    const { weddingDate, errors } = validateWeddingDate(req.body);
    if (errors.length > 0) {
        setFlash(req, 'error', 'validation.date');
        return res.redirect('/');
    }
    await updateWeddingDate(req.wedding.id, weddingDate);
    setFlash(req, 'success', weddingDate ? 'dashboard.dateSaved' : 'dashboard.dateCleared');
    res.redirect('/');
};

/** Shown to a logged-in user who belongs to no wedding (e.g. removed from their only one). */
const showWelcome = async (req, res) => {
    const pendingInvites = await findPendingInvitesForEmail(req.session.user.email);
    res.render('welcome', {
        title: req.t('welcome.title'),
        pendingInvites,
        values: { ...EMPTY_WEDDING, name: req.t('wedding.defaultName', { name: req.session.user.name }) },
        errors: []
    });
};

/** Creates another wedding owned by the current user (from /welcome or Settings). */
const processNewWedding = async (req, res) => {
    const { values, data, errors } = validateWedding(req.body);
    if (errors.length > 0) {
        const pendingInvites = await findPendingInvitesForEmail(req.session.user.email);
        return res.status(400).render('welcome', { title: req.t('welcome.title'), pendingInvites, values, errors });
    }
    const wedding = await createWedding(req.session.user.id, data);
    req.session.activeWeddingId = wedding.id;
    setFlash(req, 'success', 'wedding.created', { name: wedding.name });
    res.redirect('/');
};

/** The wedding switcher in the header. Returns to the page it was used on. */
const processSwitchWedding = async (req, res) => {
    const weddingId = readText(req.body?.wedding_id);
    const wedding = isUuid(weddingId) ? await switchActiveWedding(req, weddingId) : null;
    if (wedding) setFlash(req, 'info', 'wedding.switched', { name: wedding.name });
    else setFlash(req, 'error', 'wedding.notMember');

    const returnTo = readText(req.body?.return_to);
    res.redirect(isLocalPath(returnTo) ? returnTo : '/');
};

/** "Paste an invite link" form: sends the user to that invite's page. */
const processJoinByLink = (req, res) => {
    const token = extractInviteToken(req.body?.invite_link);
    if (!token) {
        setFlash(req, 'error', 'invite.badLink');
        const returnTo = readText(req.body?.return_to);
        return res.redirect(isLocalPath(returnTo) ? returnTo : '/');
    }
    res.redirect(`/invite/${token}`);
};

export { showDashboard, processWeddingDate, showWelcome, processNewWedding, processSwitchWedding, processJoinByLink };
