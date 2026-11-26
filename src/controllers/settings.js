import { createInvite, deleteInvite, findInvitesForWedding } from '../models/invites.js';
import {
    findPasswordHash,
    updateAppearance,
    updateBusiness,
    updatePasswordHash,
    updateProfile,
    upgradeToPlanner
} from '../models/users.js';
import { PALETTES, THEME_MODES } from '../constants.js';
import { assignableRoles, findMembers, removeMember, updateMemberRole, updateWedding } from '../models/weddings.js';
import { toSessionUser } from '../middleware/auth.js';
import { isEmailConfigured, sendInviteEmail } from '../services/email.js';
import { setFlash } from '../utils/flash.js';
import { toIsoDate } from '../utils/format.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { validateAppearance, validateBusiness, validatePasswordChange, validateProfile } from '../validators/auth.js';
import { isUuid } from '../validators/common.js';
import { readAssignableRole, validateInvite, validateWedding } from '../validators/weddings.js';

/**
 * Public base URL used in invite links. server.js requires APP_URL in production, so links
 * there never depend on the request's Host header (which a client controls).
 * @param {import('express').Request} req
 * @returns {string}
 */
const appUrl = (req) => process.env.APP_URL || `${req.protocol}://${req.get('host')}`;

/** @returns {string} The full invite URL for a token. */
const inviteUrlFor = (req, token) => new URL(`/invite/${token}`, appUrl(req)).href;

/** The link of an invite created on the previous request, shown once so the owner can copy it. */
const takeCreatedInviteUrl = (req) => {
    const url = req.session.createdInviteUrl ?? null;
    delete req.session.createdInviteUrl;
    return url;
};

/**
 * Renders the settings page. Every form on the page can be re-rendered with its own errors;
 * `forms` holds the values/errors for each one.
 */
const renderSettings = async (req, res, { status = 200, forms = {} } = {}) => {
    // A planner may have no wedding yet; then only the account sections are shown.
    const wedding = req.wedding;
    const isOwner = wedding?.role === 'owner';
    const [members, invites, passwordHash] = await Promise.all([
        wedding ? findMembers(wedding.id) : [],
        isOwner ? findInvitesForWedding(wedding.id) : [],
        findPasswordHash(req.session.user.id)
    ]);

    res.status(status).render('settings', {
        title: req.t('settings.title'),
        members,
        invites: invites.map((invite) => ({ ...invite, url: inviteUrlFor(req, invite.token) })),
        hasPassword: Boolean(passwordHash),
        emailEnabled: isEmailConfigured(),
        weddingForm: forms.wedding ?? {
            values: { name: wedding?.name ?? '', wedding_date: toIsoDate(wedding?.wedding_date) },
            errors: []
        },
        profileForm: forms.profile ?? {
            values: { display_name: req.session.user.name, language: req.session.user.language },
            errors: []
        },
        passwordForm: forms.password ?? { errors: [] },
        palettes: PALETTES,
        themeModes: THEME_MODES,
        appearanceForm: forms.appearance ?? {
            values: { palette: req.session.user.themePalette, mode: req.session.user.themeMode },
            errors: []
        },
        businessForm: forms.business ?? {
            values: {
                business_name: req.session.user.businessName ?? '',
                brand_palette: req.session.user.brandPalette ?? ''
            },
            errors: []
        },
        inviteForm: forms.invite ?? { values: { email: '', role: 'editor' }, errors: [] },
        inviteRoles: wedding ? assignableRoles(wedding) : [],
        createdInviteUrl: takeCreatedInviteUrl(req)
    });
};

const showSettings = (req, res) => renderSettings(req, res);

const processWeddingDetails = async (req, res) => {
    const { values, data, errors } = validateWedding(req.body);
    if (errors.length > 0) return renderSettings(req, res, { status: 400, forms: { wedding: { values, errors } } });

    const updated = await updateWedding(req.wedding.id, data);
    if (!updated) throw new Error('Active wedding disappeared during update');
    setFlash(req, 'success', 'settings.weddingSaved');
    res.redirect('/settings');
};

const processProfile = async (req, res) => {
    const { values, data, errors } = validateProfile(req.body);
    if (errors.length > 0) return renderSettings(req, res, { status: 400, forms: { profile: { values, errors } } });

    const updated = await updateProfile(req.session.user.id, data);
    if (!updated) throw new Error('Current user disappeared during update');
    req.session.user = toSessionUser(updated);
    req.session.language = updated.language;
    setFlash(req, 'success', 'settings.profileSaved');
    res.redirect('/settings');
};

const processPassword = async (req, res) => {
    const currentHash = await findPasswordHash(req.session.user.id);
    const { currentPassword, newPassword, errors } = validatePasswordChange(req.body, Boolean(currentHash));
    if (errors.length === 0 && currentHash && !(await verifyPassword(currentPassword, currentHash))) {
        errors.push({ field: 'current_password', key: 'settings.wrongPassword' });
    }
    if (errors.length > 0) {
        // A 401 lets the password rate limiter count wrong guesses (it skips successful requests).
        const status = errors.some((e) => e.key === 'settings.wrongPassword') ? 401 : 400;
        return renderSettings(req, res, { status, forms: { password: { errors } } });
    }

    await updatePasswordHash(req.session.user.id, await hashPassword(newPassword));
    setFlash(req, 'success', 'settings.passwordSaved');
    res.redirect('/settings');
};

const processAppearance = async (req, res) => {
    const { values, data, errors } = validateAppearance(req.body);
    if (errors.length > 0) return renderSettings(req, res, { status: 400, forms: { appearance: { values, errors } } });

    const updated = await updateAppearance(req.session.user.id, data);
    if (!updated) throw new Error('Current user disappeared during update');
    req.session.user = toSessionUser(updated);
    setFlash(req, 'success', 'settings.appearanceSaved');
    res.redirect('/settings');
};

/** "I'm a wedding planner": turns a couple account into a planner account. */
const processBecomePlanner = async (req, res) => {
    if (req.session.user.isPlanner) return res.redirect('/planner');
    const updated = await upgradeToPlanner(req.session.user.id);
    if (!updated) throw new Error('Current user disappeared during update');
    req.session.user = toSessionUser(updated);
    setFlash(req, 'success', 'settings.becamePlanner');
    res.redirect('/planner');
};

/** Planner accounts only; anyone else gets a 404, as if the page did not exist. */
const processBusiness = async (req, res, next) => {
    if (!req.session.user.isPlanner) return next();
    const { values, data, errors } = validateBusiness(req.body);
    if (errors.length > 0) return renderSettings(req, res, { status: 400, forms: { business: { values, errors } } });

    const updated = await updateBusiness(req.session.user.id, data);
    if (!updated) return next();
    req.session.user = toSessionUser(updated);
    setFlash(req, 'success', 'settings.businessSaved');
    res.redirect('/settings');
};

/** Owner only. With an email: an email invite (sent if SMTP is set up). Without: a share link. */
const processInvite = async (req, res) => {
    const { values, data, errors } = validateInvite(req.body, req.wedding);
    if (data.email && data.email === req.session.user.email.toLowerCase()) {
        errors.push({ field: 'email', key: 'settings.inviteSelf' });
    }
    if (errors.length > 0) return renderSettings(req, res, { status: 400, forms: { invite: { values, errors } } });

    const invite = await createInvite(req.wedding.id, req.session.user.id, data);
    const url = inviteUrlFor(req, invite.token);

    if (!invite.invited_email) {
        req.session.createdInviteUrl = url;
        setFlash(req, 'success', 'settings.shareLinkCreated');
        return res.redirect('/settings');
    }

    let sent = false;
    try {
        sent = await sendInviteEmail({
            to: invite.invited_email,
            inviteUrl: url,
            subject: req.t('email.inviteSubject', { inviter: req.session.user.name, wedding: req.wedding.name }),
            lines: [
                req.t('email.inviteIntro', { inviter: req.session.user.name, wedding: req.wedding.name }),
                req.t(invite.role === 'viewer' ? 'email.inviteViewer' : 'email.inviteEditor'),
                req.t('email.inviteExpiry')
            ],
            buttonLabel: req.t('email.inviteButton')
        });
    } catch (err) {
        // The invite exists either way; the owner can copy its link from the list below.
        console.error('Invite email failed:', err.message);
    }
    if (!sent) req.session.createdInviteUrl = url;
    setFlash(req, sent ? 'success' : 'info', sent ? 'settings.inviteSent' : 'settings.inviteCreatedCopyLink', {
        email: invite.invited_email
    });
    res.redirect('/settings');
};

const processRevokeInvite = async (req, res) => {
    const deleted = isUuid(req.params.id) && (await deleteInvite(req.params.id, req.wedding.id));
    setFlash(req, deleted ? 'success' : 'error', deleted ? 'settings.inviteRevoked' : 'settings.inviteMissing');
    res.redirect('/settings');
};

const processMemberRole = async (req, res) => {
    const role = readAssignableRole(req.body, req.wedding);
    const changed =
        role !== null && isUuid(req.params.userId) && (await updateMemberRole(req.wedding.id, req.params.userId, role));
    setFlash(req, changed ? 'success' : 'error', changed ? 'settings.roleSaved' : 'settings.memberMissing');
    res.redirect('/settings');
};

const processRemoveMember = async (req, res) => {
    const removed = isUuid(req.params.userId) && (await removeMember(req.wedding.id, req.params.userId));
    setFlash(req, removed ? 'success' : 'error', removed ? 'settings.memberRemoved' : 'settings.memberMissing');
    res.redirect('/settings');
};

/** A non-owner leaves the active wedding. Owners cannot leave (removeMember skips the owner). */
const processLeaveWedding = async (req, res) => {
    const left = await removeMember(req.wedding.id, req.session.user.id);
    if (!left) {
        setFlash(req, 'error', 'settings.ownerCannotLeave');
        return res.redirect('/settings');
    }
    delete req.session.activeWeddingId;
    setFlash(req, 'info', 'settings.leftWedding', { name: req.wedding.name });
    res.redirect('/');
};

export {
    processBecomePlanner,
    processAppearance,
    processBusiness,
    showSettings,
    processWeddingDetails,
    processProfile,
    processPassword,
    processInvite,
    processRevokeInvite,
    processMemberRole,
    processRemoveMember,
    processLeaveWedding
};
