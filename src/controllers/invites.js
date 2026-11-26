import { acceptInvite, declineInvite, findInviteByToken } from '../models/invites.js';
import { setFlash } from '../utils/flash.js';
import { isUuid } from '../validators/common.js';

/**
 * Loads the invite for :token, or null for a malformed or unknown token (-> 404).
 * @param {import('express').Request} req
 */
const loadInvite = async (req) => {
    const token = String(req.params.token ?? '').toLowerCase();
    return isUuid(token) ? findInviteByToken(token) : null;
};

/** True when an email invite is addressed to someone other than the logged-in user. */
const isForSomeoneElse = (invite, user) =>
    Boolean(invite.invited_email && user && invite.invited_email.toLowerCase() !== user.email.toLowerCase());

/**
 * Public invite page. Anonymous visitors are offered login/register and come back here after.
 */
const showInvite = async (req, res, next) => {
    const invite = await loadInvite(req);
    if (!invite) return next();

    const user = req.session.user ?? null;
    if (!user) req.session.returnTo = req.originalUrl;

    res.render('invite', {
        title: req.t('invite.title'),
        invite,
        wrongAccount: isForSomeoneElse(invite, user),
        errors: []
    });
};

const processAcceptInvite = async (req, res, next) => {
    const invite = await loadInvite(req);
    if (!invite) return next();

    const backToInvite = `/invite/${invite.token}`;
    if (!invite.is_usable) {
        setFlash(req, 'error', 'invite.unavailable');
        return res.redirect(backToInvite);
    }
    // Email invites belong to one address; anyone else needs a share link from the owner.
    if (isForSomeoneElse(invite, req.session.user)) {
        setFlash(req, 'error', 'invite.wrongAccount', { email: invite.invited_email });
        return res.redirect(backToInvite);
    }

    const outcome = await acceptInvite(invite, req.session.user.id);
    if (outcome === 'unavailable') {
        setFlash(req, 'error', 'invite.unavailable');
        return res.redirect(backToInvite);
    }

    req.session.activeWeddingId = invite.wedding_id;
    setFlash(req, 'success', outcome === 'joined' ? 'invite.joined' : 'invite.alreadyMember', {
        name: invite.wedding_name
    });
    res.redirect('/');
};

const processDeclineInvite = async (req, res, next) => {
    const invite = await loadInvite(req);
    if (!invite) return next();

    // Share links are not addressed to anyone, so there is nothing to decline: just leave.
    if (invite.invited_email) {
        const declined = await declineInvite(invite.token, req.session.user.email);
        if (!declined) {
            setFlash(req, 'error', 'invite.unavailable');
            return res.redirect(`/invite/${invite.token}`);
        }
    }
    setFlash(req, 'info', 'invite.declined', { name: invite.wedding_name });
    res.redirect('/');
};

export { showInvite, processAcceptInvite, processDeclineInvite };
